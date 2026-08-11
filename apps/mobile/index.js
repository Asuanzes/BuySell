// Entry personalizado de la app.
//
// Por defecto Expo usa `expo-router/entry`, que hace `renderRootComponent(App)`
// donde `App` es la raíz de expo-router (monta el NavigationContainer).
//
// PROBLEMA: cuando una app NATIVA comparte con FLAG_ACTIVITY_NEW_TASK (la app de
// Amazon, p. ej.), Android monta una 2ª instancia del root React en el MISMO
// proceso JS. Eso crea un 2º NavigationContainer de expo-router → "configured
// linking in multiple places" + "Attempted to navigate before mounting" → la
// navegación de la app real se corrompe (crash efectivo). No es evitable a nivel
// nativo (los flags del que comparte mandan sobre launchMode=singleTask).
//
// SOLUCIÓN: envolvemos `App` aquí, POR ENCIMA de expo-router. Solo la PRIMERA
// surface monta la app completa; cualquier surface posterior renderiza un aviso
// plano (sin expo-router → sin 2º NavigationContainer → sin crash). La detección
// usa un contador de surfaces a nivel de módulo (ver ./lib/primary-surface).
//
// PROMOCIÓN (BUG-15, arranque en FRÍO): la entrega del share monta dos surfaces
// SOLAPADAS — la 2ª nace antes de que muera la 1ª, ve el slot ocupado y sin esto
// se quedaba en el aviso PARA SIEMPRE aunque la 1ª muriera milisegundos después.
// Ahora la duplicada escucha `onPrimaryFree` y, si el slot se libera, se
// promociona a app completa (ocupándolo síncronamente para que solo gane una).
// Con la app ABIERTA de verdad la primaria nunca suelta el slot y el aviso se
// queda, que es el comportamiento correcto.
import "@expo/metro-runtime";

import { App } from "expo-router/build/qualified-entry";
import { renderRootComponent } from "expo-router/build/renderRootComponent";
import React, { useLayoutEffect, useRef, useState } from "react";

import { DuplicateRootNotice } from "./components/DuplicateRootNotice";
import { acquireSurface, isPrimaryFree, onPrimaryFree } from "./lib/primary-surface";

function Root(props) {
  // null = sin decidir (1er render). La DECISIÓN y la ADQUISICIÓN del slot van
  // JUNTAS en useLayoutEffect: síncrono al commit, así que entre "veo el slot
  // libre" y "lo ocupo" no puede colarse otra surface (con la decisión en render
  // y el acquire en useEffect diferido, dos surfaces pegadas podían verse AMBAS
  // primarias y montar dos NavigationContainers — el crash original). Los
  // renders descartados (React 19 / Compiler) no ejecutan effects, luego no
  // corrompen el contador. El re-render de setState en useLayoutEffect pinta
  // antes del primer frame: el `null` inicial no llega a verse.
  const [amPrimary, setAmPrimary] = useState(null);
  const releaseRef = useRef(null);

  useLayoutEffect(() => {
    let unsubscribe = null;
    if (isPrimaryFree()) {
      releaseRef.current = acquireSurface();
      setAmPrimary(true);
      console.log("[nidokey-entry] nueva surface, amPrimary = true");
    } else {
      setAmPrimary(false);
      console.log("[nidokey-entry] nueva surface, amPrimary = false");
      // Duplicada: si el slot se libera hereda la app. En FRÍO el share monta dos
      // surfaces SOLAPADAS y la 1ª muere enseguida; sin esta promoción, la 2ª se
      // quedaba clavada en el cartel (BUG-15). Ocupar el slot AQUÍ, síncrono en
      // el listener, decide el empate si hubiera varios duplicados escuchando.
      unsubscribe = onPrimaryFree(() => {
        if (!isPrimaryFree()) return; // otro listener ganó el slot en este aviso
        unsubscribe?.();
        unsubscribe = null;
        releaseRef.current = acquireSurface();
        console.log("[nidokey-entry] surface duplicada PROMOCIONADA a primaria");
        setAmPrimary(true);
      });
    }
    return () => {
      unsubscribe?.();
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, []);

  if (amPrimary === null) return null;
  return amPrimary
    ? React.createElement(App, props)
    : React.createElement(DuplicateRootNotice);
}

renderRootComponent(Root);
