import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import axios from "axios";

function unwrapPayload(responseData) {
    return responseData?.data ?? responseData;
}

async function getUser(credentials) {
    const response = await axios.post(
        `${process.env.BACKEND_URL}/api/auth/login`,
        {
            email: credentials.email,
            password: credentials.password,
        },
        { validateStatus: () => true }
    );

    return response.data; // { status, msg, user, token }
}

export const authOptions = {
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
                params: {
                    prompt: "select_account",
                },
            },
        }),

        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: {},
                password: {},
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error("Missing credentials");
                }

                const data = await getUser(credentials);
                const payload = unwrapPayload(data);

                if (data.status == "error") {
                    // 🔑 THIS is what allows client-side error handling
                    throw new Error(data.msg || "Invalid email or password");
                }
                return {
                    ...payload.user,
                    id: (payload.user?.id || payload.user?._id || "").toString(),
                    token: payload.token,
                };
            },
        }),
    ],
    session: {
        strategy: "jwt",
    },
    callbacks: {
        async signIn({ user, account }) {
            // Only handle OAuth here
            // console.log(user);
            // console.log(account);
            
            const res = await axios.post(
                `${process.env.BACKEND_URL}/api/auth/oauth`,
                {
                    email: user.email,
                    name: user.name,
                    image: user.image,
                    provider: account.provider, // "google"
                },
                { validateStatus: () => true }
            );

            const data = res.data;
            const payload = unwrapPayload(data);

            if (data.status !== "success") {
                throw new Error(data.msg || "OAuth login failed");
            }

            // Attach backend info to NextAuth user
            user = payload.user;
            user.token = payload.token;
            user.id = payload.user?.id || payload.user?._id;
            console.log(
                user
            );
            return true;
        },

        // async jwt({ token, user }) {
        //     if (user) {
        //         token.id = user.id;
        //         token.backendToken = user.backendToken;
        //     }
        //     return token;
        // },

        // async session({ session, token }) {
        //     session.user.id = token.id;
        //     session.backendToken = token.backendToken;
        //     return session;
        // },
    }


};

export const {
    handlers: { GET, POST },
    signIn,
    signOut,
    auth,
} = NextAuth(authOptions);
