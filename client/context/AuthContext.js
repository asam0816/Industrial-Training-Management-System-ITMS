'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
const AuthContext=createContext(null);
export function AuthProvider({children}){
  const [user,setUser]=useState(null); const [loading,setLoading]=useState(true);
  const refreshUser=async()=>{try{const {data}=await api.get('/auth/me');setUser(data.data.user)}catch{setUser(null)}finally{setLoading(false)}};
  useEffect(()=>{refreshUser()},[]);
  const login=async(credentials)=>{const {data}=await api.post('/auth/login',credentials);setUser(data.data.user);return data.data.user};
  const logout=async()=>{try{await api.post('/auth/logout')}finally{setUser(null)}};
  const value=useMemo(()=>({user,role:user?.role,isAuthenticated:!!user,loading,login,logout,refreshUser}),[user,loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export const useAuth=()=>useContext(AuthContext);
