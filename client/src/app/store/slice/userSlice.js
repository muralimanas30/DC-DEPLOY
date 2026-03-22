import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    id: null,
    name: null,
    email: null,

    roles: [],
    activeRole: null,

    currentDisasterId: null,

    location: null,

    socketConnected: false,
    isAuthenticated: false
};

const userSlice = createSlice({
    name: "user",
    initialState,
    reducers: {
        setUser(state, action) {
            const { id, name, email, roles, activeRole } = action.payload;

            state.id = id;
            state.name = name;
            state.email = email;
            state.roles = roles;
            state.activeRole = activeRole;
            state.isAuthenticated = true;
        },

        clearUser(state) {
            Object.assign(state, initialState);
        },

        switchRole(state, action) {
            state.activeRole = action.payload;
        },

        joinDisaster(state, action) {
            state.currentDisasterId = action.payload;
        },

        leaveDisaster(state) {
            state.currentDisasterId = null;
        },

        updateLocation(state, action) {
            state.location = {
                lat: action.payload.lat,
                lng: action.payload.lng
            };
        },

        setSocketConnected(state, action) {
            state.socketConnected = action.payload;
        }
    }
});

export const {
    setUser,
    clearUser,
    switchRole,
    joinDisaster,
    leaveDisaster,
    updateLocation,
    setSocketConnected
} = userSlice.actions;

export default userSlice.reducer;
