import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import axios from "axios";

function unwrapPayload(responseData) {
    return responseData?.data ?? responseData;
}

function getBackendBaseUrl() {
    return process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
}

async function getUser(credentials) {
    try {
        const response = await axios.post(
            `${getBackendBaseUrl()}/api/auth/login`,
            {
                email: credentials.email,
                password: credentials.password,
            },
            { validateStatus: () => true }
        );

        return response.data;
    } catch {
        throw new Error("Backend service unavailable");
    }
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
                    return null;
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
    pages: {
        signIn: "/login",
        error: "/login",
    },
    callbacks: {
        async signIn({ user, account }) {
            if (!account?.provider || account.provider === "credentials") {
                return true;
            }

            try {
                const res = await axios.post(
                    `${getBackendBaseUrl()}/api/auth/oauth`,
                    {
                        email: user.email,
                        name: user.name,
                        image: user.image,
                        provider: account.provider,
                    },
                    { validateStatus: () => true }
                );

                const data = res.data;
                const payload = unwrapPayload(data);

                if (data.status !== "success") {
                    const msg = encodeURIComponent(data.msg || "OAuth login failed");
                    return `/login?authError=${msg}`;
                }

                const backendUser = payload?.user || {};

                // Persist backend identity on the auth user object so jwt/session callbacks can carry it.
                user.id = (backendUser?.id || backendUser?._id || user?.id || "").toString();
                user.token = payload?.token;
                user.roles = backendUser?.roles || user?.roles;
                user.activeRole = backendUser?.activeRole || user?.activeRole;
                user.role = backendUser?.activeRole || backendUser?.role || user?.role;
                user.assignedIncident = backendUser?.assignedIncident || user?.assignedIncident || null;
                user.skills = backendUser?.skills || user?.skills || [];
                user.name = backendUser?.name || user?.name;
                user.email = backendUser?.email || user?.email;
                user.image = backendUser?.image || user?.image;

                return true;
            } catch {
                return "/login?authError=Backend%20service%20unavailable";
            }
        },

        async jwt({ token, user, trigger, session }) {
            if (user) {
                token.id = user.id || user._id || token.id;
                token.token = user.token || token.token;
                token.roles = user.roles || token.roles;
                token.activeRole = user.activeRole || user.role || token.activeRole;
                token.role = token.activeRole || token.role;
                token.name = user.name || token.name;
                token.email = user.email || token.email;
                token.image = user.image || token.image;
                token.assignedIncident = user.assignedIncident || token.assignedIncident || null;
                token.skills = user.skills || token.skills || [];
            }

            if (trigger === "update" && session) {
                if (session.activeRole) {
                    token.activeRole = session.activeRole;
                    token.role = session.activeRole;
                }

                if (Array.isArray(session.roles)) {
                    token.roles = session.roles;
                }

                if (session.assignedIncident !== undefined) {
                    token.assignedIncident = session.assignedIncident;
                }

                if (Array.isArray(session.skills)) {
                    token.skills = session.skills;
                }
            }

            return token;
        },

        async session({ session, token }) {
            session.user = {
                ...session.user,
                id: token.id,
                token: token.token,
                roles: token.roles,
                activeRole: token.activeRole,
                role: token.activeRole || token.role,
                assignedIncident: token.assignedIncident,
                skills: token.skills || [],
            };
            return session;
        },
    }


};

export const {
    handlers: { GET, POST },
    signIn,
    signOut,
    auth,
} = NextAuth(authOptions);
