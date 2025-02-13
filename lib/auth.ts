import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth, BetterAuthOptions } from "better-auth";
import { connection, user as _user } from "@/db/schema";
import { customSession } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@/db";

// If there is no resend key, it might be a local dev environment
// In that case, we don't want to send emails and just log them
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : { emails: { send: async (...args: any[]) => console.log(args) } };

const options = {
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (every 1 day the session expiration is updated)
  },
  socialProviders: {
    google: {
      // Remove this before going to prod, it's to force to get `refresh_token` from google, some users don't have it yet.
      prompt: "consent",
      accessType: "offline",
      scope: ["https://mail.google.com/"],
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from: "Your App <onboarding@resend.dev>", // Update this with your verified domain
        to: user.email,
        subject: "Reset your password",
        html: `
          <h2>Reset Your Password</h2>
          <p>Click the link below to reset your password:</p>
          <a href="${url}">${url}</a>
          <p>If you didn't request this, you can safely ignore this email.</p>
        `,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await resend.emails.send({
        from: "Mail0 <onboarding@resend.dev>",
        to: user.email,
        subject: "Verify your email",
        html: `
          <h2>Verify Your Email</h2>
          <p>Click the link below to verify your email:</p>
          <a href="${url}">${url}</a>
        `,
      });
    },
  },
  plugins: [
    customSession(async ({ user, session }) => {
      const [foundUser] = await db
        .select({
          activeConnectionId: _user.defaultConnectionId,
        })
        .from(_user)
        .where(eq(_user.id, user.id))
        .limit(1);
      if (!foundUser.activeConnectionId) {
        const [defaultConnection] = await db
          .select()
          .from(connection)
          .where(eq(connection.userId, user.id))
          .limit(1);
        return {
          connectionId: defaultConnection ? defaultConnection.id : null,
          user,
          session,
        };
      }
      return {
        connectionId: foundUser.activeConnectionId,
        user,
        session,
      };
    }),
  ],
} satisfies BetterAuthOptions;

export const auth = betterAuth({
  ...options,
});
