"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";
import { ShieldCheck, Eye, EyeOff } from "lucide-react";
export default function Login() {
  const [form, setForm] = useState({
    identifier: "",
    password: "",
    rememberMe: false,
  });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(form);
      toast.success("Signed in successfully");
      router.replace(
        u.role === "ADMIN"
          ? "/admin/dashboard"
          : u.role === "COORDINATOR"
            ? "/coordinator/dashboard"
            : "/student/dashboard",
      );
    } catch (e) {
      toast.error(
        e.response?.data?.message || "Invalid email/username or password",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-wrap">
      <div className="auth-side">
        <ShieldCheck size={54} />
        <h1 style={{ fontSize: 44 }}>Welcome to ITMS</h1>
        <p style={{ fontSize: 18, lineHeight: 1.8, color: "#dbeafe" }}>
          Secure access to industrial training documents, announcements, student
          services and communication.
        </p>
      </div>
      <div className="auth-panel">
        <form className="auth-card card" onSubmit={submit}>
          <h1>Sign in</h1>
          <p className="muted">Use your email, username or student number.</p>
          <div style={{ marginTop: 22 }}>
            <label className="label">Email / Username / Student Number</label>
            <input
              className="input"
              required
              value={form.identifier}
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <label className="label">Password</label>
            <div style={{ position: "relative" }}>
              <input
                className="input"
                style={{ paddingRight: 45 }}
                type={show ? "text" : "password"}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                style={{
                  position: "absolute",
                  right: 8,
                  top: 7,
                  border: 0,
                  background: "transparent",
                  padding: 5,
                }}
              >
                {show ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>
          <label style={{ display: "flex", gap: 8, margin: "16px 0" }}>
            <input
              type="checkbox"
              checked={form.rememberMe}
              onChange={(e) =>
                setForm({ ...form, rememberMe: e.target.checked })
              }
            />{" "}
            Remember me
          </label>
          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={busy}
          >
            {busy ? "Signing in..." : "Sign In"}
          </button>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 18,
            }}
          >
            <Link className="link" href="/">
              Home
            </Link>
            <Link className="link" href="/forgot-password">
              Forgot password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
