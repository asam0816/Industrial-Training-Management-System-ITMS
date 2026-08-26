"use client";
import { useState } from "react";
import Link from "next/link";
import api from "../../services/api";
import { toast } from "sonner";
export default function Forgot() {
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      toast.success(data.message);
      setLink(data.data?.resetUrl || "");
    } catch (e) {
      toast.error(e.response?.data?.message || "Request failed");
    }
  };
  return (
    <div className="auth-panel">
      <form className="auth-card card" onSubmit={submit}>
        <h1>Forgot password</h1>
        <p className="muted">Enter your registered email address.</p>
        <label className="label">Email</label>
        <input
          className="input"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 16 }}
        >
          Create Reset Link
        </button>

        <Link
          className="link"
          href="/login"
          style={{ display: "inline-block", marginTop: 18 }}
        >
          Back to login
        </Link>
      </form>
    </div>
  );
}
