import { createContext, useContext } from "react";
import { peut as peutDroit } from "./droits.js";

export const AuthContext = createContext({ user: null, peut: () => false });
export const useAuth = () => useContext(AuthContext);
export const fabriquerAuth = (user) => ({ user, peut: (action) => peutDroit(user, action) });
