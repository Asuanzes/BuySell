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
import React, { useEffect, useReducer, useRef } from "react";

import { DuplicateRootNotice } from "./components/DuplicateRootNotice";
import { acquireSurface, isPrimaryFree, onPrimaryFree } from "./lib/primary-surface";

function Root(props) {
  // Latcheamos la decisión UNA vez (lectura pura). La mutación del contador va en
  // effects/listeners — nunca en render — para no corromperlo con renders
  // descartados (React 19 / React Compiler / render concurrente).
  const amPrimaryRef = useRef(null);
  const releaseRef = useRef(null);
  const [, forceRender] = useReducer((n) => n + 1, 0);
  if (amPrimaryRef.current === null) {
    amPrimaryRef.current = isPrimaryFree();
    // Una línea por surface montada: confirma qué surface es la app real y cuál
    // es una duplicada (p. ej. share desde una app nativa). Diagnóstico barato.
    console.log("[nidokey-entry] nueva surface, amPrimary =", amPrimaryRef.current);
  }
  const amPrimary = amPrimaryRef.current;

  useEffect(() => {
    if (amPrimaryRef.current) {
      releaseRef.current = acquireSurface();
    } else {
      // Duplicada: si el slot se libera (la surface del arranque en frío muere),
      // esta hereda la app. Ocupar el slot AQUÍ, síncrono, decide el empate si
      // hubiera varios duplicados escuchando.
      const unsubscribe = onPrimaryFree(() => {
        if (!isPrimaryFree()) return; // otro listener ganó el slot en este aviso
        unsubscribe();
        releaseRef.current = acquireSurface();
        amPrimaryRef.current = true;
        console.log("[nidokey-entry] surface duplicada PROMOCIONADA a primaria");
        forceRender();
      });
      return () => {
        unsubscribe();
        releaseRef.current?.();
      };
    }
    return () => releaseRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- efecto de montaje único; la promoción vive en el listener
  }, []);

  return amPrimary
    ? React.createElement(App, props)
    : React.createElement(DuplicateRootNotice);
}

renderRootComponent(Root);
