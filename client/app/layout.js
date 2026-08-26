import "./globals.css";
import { Toaster } from "sonner";
import { AuthProvider } from "../context/AuthContext";

export const metadata = {
  title: "ITMS",
  description: "Industrial Training Management System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
