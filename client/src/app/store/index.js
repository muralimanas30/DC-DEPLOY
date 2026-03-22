import { configureStore } from "@reduxjs/toolkit"
import { thunk } from "redux-thunk"
import userReducer from './slice/userSlice'
export const store = configureStore({
    reducer: {
        user:userReducer
    }
})
