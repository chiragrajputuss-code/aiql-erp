import { redirect } from "next/navigation";

export default function ApiKeysRedirect() {
  redirect("/settings/api-keys");
}
