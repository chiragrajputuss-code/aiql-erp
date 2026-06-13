import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WelcomeStep } from "@/components/onboarding/welcome-step";

export const metadata = { title: "Welcome to AIQL" };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // If onboarding already complete, send them to the dashboard.
  if (user.onboardingComplete) redirect("/");

  // Render outside the dashboard chrome — WelcomeStep provides its own full-page layout.
  return <WelcomeStep />;
}
