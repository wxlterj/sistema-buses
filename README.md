## **1\. Introducción**

El programa es un simulador interactivo de redes de transporte público, diseñado para modelar la navegación urbana en una ciudad basada en cuadrículas. El sistema permite al usuario visualizar rutas de autobuses, calcular trayectos óptimos entre paradas y gestionar el estado de la red (simulando fallos de accesibilidad). Internamente, el software modela la ciudad como un grafo ponderado y utiliza algoritmos de camino mínimo modificados para priorizar factores como el tiempo, la distancia y la accesibilidad.

## **2\. Objetivo del uso de estructuras de datos**

El objetivo principal es representar eficientemente la topología de la ciudad y las conexiones de transporte para permitir cálculos de ruta en tiempo real. El uso de grafos (listas de adyacencia), colas de prioridad y mapas de estado permite al sistema no solo encontrar un camino entre A y B, sino "tomar decisiones" inteligentes: evitar estaciones fuera de servicio, penalizar transbordos costosos y diferenciar entre distancia física y tiempo de viaje. Estas estructuras garantizan que la interfaz responda instantáneamente a los cambios en la configuración de la red.

## **3\. Uso de herramientas de inteligencia artificial**

Aproximadamente el 70% del código base, incluyendo la lógica de renderizado SVG y la implementación del algoritmo de búsqueda, fue desarrollado con el apoyo de herramientas de inteligencia artificial. La IA se utilizó principalmente para la refactorización de código, la implementación de la lógica de interfaz de usuario (UI) y la adaptación del algoritmo de Dijkstra para manejar restricciones complejas (accesibilidad y penalización de transbordos).

## **4\. Estructuras de datos utilizadas**

### **a. Grafo Ponderado (Representado como Lista de Adyacencia)**

* Por qué se usó:  
  Es la estructura estándar para modelar redes de transporte. Permite representar las intersecciones como "nodos" y los tramos de calle como "aristas". Es vital para saber qué nodo conecta con cuál y cuál es el "costo" (peso) de viajar entre ellos.  
* Cómo se usó:  
  Se implementó mediante un objeto de JavaScript (graph) donde cada clave es el ID de un nodo (ej. "10\_15"). El valor asociado es una lista de objetos que representan a los vecinos accesibles, conteniendo el peso del trayecto (distancia) y el color de la línea de bus que conecta ambos puntos.

### **b. Mapas de Estado (Hash Maps para Costos y Predecesores)**

* Por qué se usó:  
  Para el cálculo de rutas con transbordos, no basta con saber el costo de llegar a un nodo; es necesario saber con qué línea de bus se llegó. Los mapas permiten guardar estados complejos y recuperar información en tiempo constante O(1).  
* Cómo se usó:  
  Se utilizaron dos objetos Map: minCosts y prev. En lugar de usar solo el ID del nodo como clave, se usaron claves compuestas (ej. "nodoID\_colorLinea"). Esto permite al algoritmo diferenciar entre llegar a la estación "Central" en la línea Roja vs. la línea Azul, lo cual es crucial para calcular si se requiere un transbordo.

### **c. Cola de Prioridad (Priority Queue)**

* Por qué se usó:  
  Es el corazón del algoritmo de Dijkstra. Permite que el sistema explore siempre la ruta más prometedora (la de menor costo acumulado) antes que las rutas largas, optimizando drásticamente el tiempo de búsqueda frente a una búsqueda ciega.  
* Cómo se usó:  
  Se simuló mediante un Array de objetos que almacena el estado actual de exploración { nodo, costo, lineaLlegada }. En cada iteración del bucle while, el arreglo se ordena (.sort()) para extraer y procesar el nodo con el menor costo acumulado hasta el momento.

### **d. Clase y Array de Objetos (Gestión de Nodos)**

* Por qué se usó:  
  Para mantener la información semántica y visual de cada punto de la ciudad de manera organizada.  
* Cómo se usó:  
  Se creó una clase Node que encapsula propiedades como coordenadas (x, y), estado de la estación (isAccessible, isTransfer) y metadatos. Todos los nodos se almacenan en un arreglo lineal nodes para facilitar iteraciones rápidas durante el renderizado y la búsqueda de elementos en el DOM.

## **5\. Interacciones entre las estructuras**

Las estructuras trabajan en conjunto para permitir la simulación dinámica:

1. **Inicialización:** Al cargar, el script recorre la cuadrícula y crea instancias de la clase Node, almacenándolas en el array nodes.  
2. **Construcción del Grafo:** Se iteran las configuraciones de las líneas de bus; por cada conexión entre nodos, se actualiza la lista de adyacencia en el objeto graph.  
3. **Gestión de Estado:** Cuando el usuario marca una estación como "Sin Servicio" (usando la tuerquita), se actualiza la propiedad isAccessible en el objeto Node específico dentro del array.  
4. **Búsqueda (Dijkstra):**  
   * El algoritmo consulta graph para obtener vecinos.  
   * Verifica la propiedad isAccessible del Node destino; si es false, asigna un peso infinito (bloqueo).  
   * Utiliza la **Cola de Prioridad** para decidir qué camino expandir.  
   * Guarda el progreso en los **Mapas de Estado**.  
5. **Resultado:** Finalmente, se recorre el mapa prev hacia atrás para reconstruir la ruta paso a paso y visualizarla en el Canvas.

