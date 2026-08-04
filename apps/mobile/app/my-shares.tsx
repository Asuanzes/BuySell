import { Redirect } from "expo-router";

/** Ruta legada: el contenido vive ahora en el hub /shares (pestaña «Míos»). */
export default function MySharesRedirect() {
  return <Redirect href={"/shares?tab=mine" as never} />;
}
