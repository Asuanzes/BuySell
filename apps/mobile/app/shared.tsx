import { Redirect } from "expo-router";

/** Ruta legada: el contenido vive ahora en el hub /shares (pestaña «Conmigo»). */
export default function SharedRedirect() {
  return <Redirect href={"/shares?tab=received" as never} />;
}
