<img width="600" height="292" alt="piano original" src="https://github.com/user-attachments/assets/1da68d1b-07c9-493e-be93-8654884cd0b0" />


# 🎹 Kharla Piano

**Piano virtual online, gratuito y basado en web**, con soporte para MIDI USB, detección de acordes, múltiples instrumentos y efectos de sonido.

Kharla Piano está diseñado para convertir el navegador en un instrumento musical interactivo que pueda utilizarse desde un ordenador o dispositivo compatible, sin necesidad de instalar un programa de escritorio.

## ✨ Características

* 🎹 Piano virtual interactivo
* 🎼 Detección de acordes y notas activas
* 🎛️ Control de volumen, reverb, decay y delay
* 🎧 Diferentes sonidos e instrumentos
* 🎹 Splendid Grand Piano
* 🎹 Grand Acoustic
* 🎹 Bright Piano
* 🎹 Warm Piano
* 🎹 Electric Piano / Rhodes
* 🎹 Honky-Tonk
* 🎹 Piano U20
* 🎛️ Yamaha DX7
* 🎛️ Wurlitzer
* 🎼 Órgano Hammond
* ⛪ Órgano de tubos
* 🎻 Strings
* 🎺 Trompeta
* 🎷 Saxofón
* 🎺 Trombón
* 🪗 Acordeón vallenato
* 🪗 Acordeón de cumbia
* 🎚️ Nord Synth Pad
* 🎨 Diferentes temas visuales
* 🔌 Entrada MIDI USB
* 🔌 Salida MIDI USB
* 📱 Diseño preparado para dispositivos móviles
* ⚡ Arquitectura PWA con Service Worker

## 🎼 Instrumentos

Kharla Piano incluye diferentes categorías de sonidos:

### Pianos

* Splendid Grand Piano
* Grand Acoustic
* Bright Piano
* Warm Piano
* Electric Piano
* Honky-Tonk
* Piano U20

### Sintetizadores

* Yamaha DX7
* Wurlitzer
* Diferentes sonidos sintetizados

### Órganos

* Hammond
* Órgano de tubos

### Cuerdas y vientos

* Strings
* Trompeta
* Saxofón
* Trombón

### Acordeones

* Acordeón vallenato
* Acordeón de cumbia

### Pads

El piano también incorpora un **Nord Synth Pad** con diferentes sonidos:

* Warm Pad
* Soft Strings
* Analog Sweep
* Pad Wordship-4

## 🎹 Detector de acordes

Una de las funciones principales de Kharla Piano es la detección de las notas que están siendo tocadas.

La interfaz muestra:

* **Acorde detectado**
* **Notas activas**

Esto permite utilizar el piano no solamente como instrumento virtual, sino también como herramienta para experimentar y aprender acordes.

## 🔌 MIDI USB

Kharla Piano incorpora controles para:

* Entrada MIDI USB
* Salida MIDI USB

Esto permite utilizar el navegador junto con dispositivos MIDI compatibles.

## 🎛️ Efectos

El instrumento incluye controles independientes para diferentes parámetros de sonido:

### Volumen Master

Control de volumen general con cinco niveles.

### Reverberación

Permite modificar la cantidad de reverberación aplicada al sonido.

### Decay

Control del decay del instrumento, incluyendo diferentes niveles de respuesta.

### Delay

Control del efecto delay.

### Volumen del Pad

El Nord Synth Pad dispone de su propio control de volumen.

## 📱 Progressive Web App

Kharla Piano está preparado como **Progressive Web App (PWA)**.

El proyecto utiliza:

* `manifest.json`
* `service worker`
* diseño responsive
* capacidades compatibles con instalación como aplicación web

El Service Worker se registra automáticamente cuando se carga la aplicación.

## 🧰 Tecnologías

El proyecto utiliza tecnologías web estándar:

* HTML5
* CSS3
* JavaScript
* Web Audio / MIDI APIs del navegador
* Progressive Web App (PWA)
* ES Modules

Para los instrumentos de audio se utiliza la biblioteca **smplr**.

La aplicación carga `smplr` mediante un módulo ES desde `esm.sh`.

## 📁 Estructura del proyecto

Una estructura típica del proyecto es:

```text
/
├── index.html
├── app.js
├── style.css
├── manifest.json
├── sw.js
└── README.md
```

### `index.html`

Contiene la estructura principal de la aplicación, los controles, el teclado virtual y la configuración inicial.

### `app.js`

Contiene la lógica principal de interacción del piano.

### `style.css`

Contiene los estilos visuales de la aplicación.

### `manifest.json`

Define la información necesaria para la Progressive Web App.

### `sw.js`

Implementa el Service Worker utilizado por la aplicación.

## 🚀 Ejecutar el proyecto

Puedes clonar el repositorio:

```bash
git clone https://github.com/TU-USUARIO/TU-REPOSITORIO.git
```

Después entra en la carpeta:

```bash
cd TU-REPOSITORIO
```

Como se trata de una aplicación web, puedes servirla utilizando cualquier servidor web estático.

También puedes publicarla directamente mediante **GitHub Pages**.

## 🌐 GitHub Pages

Kharla Piano puede alojarse mediante GitHub Pages.

Una vez habilitado GitHub Pages para el repositorio, la aplicación estará disponible directamente desde el navegador.

> Para algunas funciones relacionadas con MIDI y determinadas capacidades del navegador, es recomendable utilizar un entorno compatible y una conexión segura mediante HTTPS.

## 🎯 Objetivo del proyecto

El objetivo de Kharla Piano es crear una experiencia musical accesible directamente desde el navegador, combinando:

**Piano virtual + instrumentos + MIDI + efectos + detección de acordes + PWA**

La idea es continuar evolucionando el proyecto para convertirlo en una herramienta musical web cada vez más completa.

## 🛠️ Estado del proyecto

🚧 **En desarrollo**

Kharla Piano continúa evolucionando con nuevas funciones, sonidos, mejoras de interfaz y optimizaciones.

## 🤝 Contribuciones

Las contribuciones, ideas y sugerencias son bienvenidas.

Si encuentras un problema o tienes una propuesta para mejorar el proyecto, puedes abrir un **Issue** en GitHub.

También puedes realizar un **Pull Request** con mejoras al proyecto.

## 📄 Licencia

La licencia del proyecto debe definirse según las condiciones que el autor quiera establecer.

---

## 🎹 Kharla Piano

**Toca. Experimenta. Aprende. Crea.**

Un piano virtual directamente en tu navegador.


