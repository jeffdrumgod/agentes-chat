import { useLocalSearchParams } from "expo-router";
import { AuthFlow } from "@/features/auth/AuthFlow";
import { ServerAddress } from "@/features/server/ServerAddress";
import { useNeedsServer } from "@/lib/server";

/**
 * Entrar: the e-mail first, then the one step the server says it needs. On a build without a server of its own and
 * none chosen yet, "Onde fica o seu agentes.chat?" comes first, in its place: once a server is chosen (its address or
 * a QR code), this same screen is the e-mail.
 */
export default function SignIn() {
  // From an invitation's link ("Já tem conta? Entrar", a request that ended): its e-mail, straight to the password.
  const params = useLocalSearchParams<{ email?: string }>();
  const needsServer = useNeedsServer();
  if (needsServer) return <ServerAddress onDone={() => {}} />;
  return <AuthFlow start="in" email={typeof params.email === "string" ? params.email : undefined} />;
}
