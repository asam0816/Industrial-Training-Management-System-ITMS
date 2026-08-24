'use client';
import { useEffect } from 'react';import { useRouter } from 'next/navigation';import { useAuth } from '../context/AuthContext';import Loading from './Loading';
export default function RoleGuard({roles,children}){const {user,loading}=useAuth();const router=useRouter();useEffect(()=>{if(!loading&&!user)router.replace('/login');else if(!loading&&user&&!roles.includes(user.role))router.replace('/unauthorized')},[user,loading,roles,router]);if(loading||!user||!roles.includes(user.role))return <Loading/>;return children}
