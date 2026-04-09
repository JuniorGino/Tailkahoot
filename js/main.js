const TIEMPO_PREGUNTA = 10;

// Variables Locales
let miRol = null; // 'admin' o 'jugador'
let miId = 'id_' + Math.random().toString(36).substr(2, 9);
let miNombre = '';
let syncInterval = null;
let timerActivo = null;

const screens = {
    inicio: document.getElementById('screen-inicio'),
    registro: document.getElementById('screen-registro'),
    sala: document.getElementById('screen-sala'),
    preguntas: document.getElementById('screen-preguntas'),
    ranking: document.getElementById('screen-ranking'),
    resultados: document.getElementById('screen-resultados')
};

// ========================
// COMUNICACIÓN (LocalStorage)
// ========================

function initEstadoGlobal() {
    if (!localStorage.getItem('k_estado')) {
        limpiarJuegoGlobal();
    }
}

function limpiarJuegoGlobal() {
    localStorage.setItem('k_estado', 'inicio'); // inicio, sala, preguntas, ranking, resultados
    localStorage.setItem('k_jugadores', JSON.stringify([]));
    localStorage.setItem('k_pregunta_idx', '0');
    localStorage.setItem('k_tiempo', TIEMPO_PREGUNTA.toString());
    localStorage.setItem('k_mostrar_correcta', 'false');
}

function obtenerEstado() {
    return {
        estado: localStorage.getItem('k_estado') || 'inicio',
        jugadores: JSON.parse(localStorage.getItem('k_jugadores') || '[]'),
        preguntaIdx: parseInt(localStorage.getItem('k_pregunta_idx') || '0'),
        tiempo: parseInt(localStorage.getItem('k_tiempo') || TIEMPO_PREGUNTA.toString()),
        mostrarCorrecta: localStorage.getItem('k_mostrar_correcta') === 'true'
    };
}

function actualizarJugadores(nuevosJugadores) {
    localStorage.setItem('k_jugadores', JSON.stringify(nuevosJugadores));
}

// ========================
// UTILIDADES E INICIALIZACIÓN
// ========================

function cambiarPantalla(pantallaId) {
    Object.values(screens).forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    screens[pantallaId].classList.remove('hidden');
    screens[pantallaId].classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    initEstadoGlobal();

    // Limpiar toda la partida para empezar de 0
    document.getElementById('btn-limpiar-datos').addEventListener('click', () => {
        limpiarJuegoGlobal();
        alert('Partida de prueba limpiada en este navegador. Abre en otra pestaña para simular jugadores.');
    });

    // Admin
    document.getElementById('btn-entrar-admin').addEventListener('click', () => {
        miRol = 'admin';
        miNombre = 'ADMIN';
        document.body.classList.add('modo-admin');
        localStorage.setItem('k_estado', 'sala'); // Fuerza estado sala
        iniciarSync();
    });

    // Jugador
    document.getElementById('btn-entrar-jugador').addEventListener('click', () => {
        miRol = 'jugador';
        cambiarPantalla('registro');
    });

    // Volver
    document.querySelectorAll('.btn-volver-inicio').forEach(btn => {
        btn.addEventListener('click', () => {
            cambiarPantalla('inicio');
        });
    });

    // Confirmar Nombre
    document.getElementById('btn-confirmar-nombre').addEventListener('click', () => {
        const nombreVal = document.getElementById('input-nombre').value.trim();
        if (nombreVal) {
            miNombre = nombreVal;
            const st = obtenerEstado();
            st.jugadores.push({
                id: miId,
                nombre: miNombre,
                puntos: 0,
                respuesta_actual: null,
                tiempo_respuesta: 0
            });
            actualizarJugadores(st.jugadores);
            iniciarSync();
        } else {
            alert('Ingresa tu Identidad.');
        }
    });

    // Acciones exclusivas del Admin
    document.getElementById('btn-comenzar-juego').addEventListener('click', () => {
        if(miRol === 'admin') {
            localStorage.setItem('k_pregunta_idx', '0');
            iniciarCicloPreguntaAdmin();
        }
    });

    document.getElementById('btn-siguiente-pregunta').addEventListener('click', () => {
        if(miRol === 'admin') {
            let st = obtenerEstado();
            if(st.preguntaIdx + 1 < bancoPreguntas.length) {
                localStorage.setItem('k_pregunta_idx', (st.preguntaIdx + 1).toString());
                iniciarCicloPreguntaAdmin();
            } else {
                localStorage.setItem('k_estado', 'resultados');
            }
        }
    });

    document.getElementById('btn-reiniciar-host').addEventListener('click', () => {
        if(miRol === 'admin') {
            limpiarJuegoGlobal();
            localStorage.setItem('k_estado', 'sala'); 
        }
    });

    // Salir (Para el jugador)
    document.getElementById('btn-salir').addEventListener('click', () => {
        window.location.reload();
    });

    // Botones de respuesta
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(miRol !== 'jugador') return;
            const idx = parseInt(e.currentTarget.dataset.index);
            enviarRespuestaJugador(idx);
        });
    });
});

// ========================
// SYNC (LOOP DE ESTADO)
// ========================

let ultimoEstadoLocal = '';
let ultimoMostrarCorrecta = false;

function iniciarSync() {
    if (miRol === 'admin') {
        document.getElementById('btn-comenzar-juego').classList.remove('hidden');
        document.getElementById('btn-siguiente-pregunta').classList.remove('hidden');
        document.getElementById('btn-reiniciar-host').classList.remove('hidden');
        document.getElementById('texto-esperando-host').classList.add('hidden');
        document.getElementById('texto-esperando-ranking').classList.add('hidden');
        document.getElementById('contenedor-opciones').classList.add('host-mode');
    } else {
        document.getElementById('btn-comenzar-juego').classList.add('hidden');
        document.getElementById('btn-siguiente-pregunta').classList.add('hidden');
        document.getElementById('btn-reiniciar-host').classList.add('hidden');
        document.getElementById('texto-esperando-host').classList.remove('hidden');
        document.getElementById('texto-esperando-ranking').classList.remove('hidden');
        document.getElementById('contenedor-opciones').classList.remove('host-mode');
        document.body.classList.remove('modo-admin');
    }

    if (syncInterval) clearInterval(syncInterval);
    
    syncInterval = setInterval(() => {
        const state = obtenerEstado();
        renderizarUI(state);
    }, 500); 
    
    renderizarUI(obtenerEstado());
}

function renderizarUI(state) {
    if (state.estado !== ultimoEstadoLocal) {
        cambiarPantalla(state.estado);
        ultimoEstadoLocal = state.estado;
        
        if (state.estado === 'preguntas') {
            document.getElementById('mensaje-respondido').classList.add('hidden');
            document.querySelectorAll('.option-btn').forEach(b => {
                b.classList.remove('correct', 'wrong');
                b.disabled = miRol === 'admin'; 
                b.style.opacity = '1';
                b.style.display = 'flex';
            });
            document.getElementById('contenedor-opciones').style.display = 'grid';
            ultimoMostrarCorrecta = false;
        }
    }

    // Confeti
    if (state.estado === 'preguntas' && !ultimoMostrarCorrecta && state.mostrarCorrecta) {
        ultimoMostrarCorrecta = true;
        if (miRol === 'jugador') {
            const miJugador = state.jugadores.find(j => j.id === miId);
            const preg = bancoPreguntas[state.preguntaIdx];
            if (miJugador && miJugador.respuesta_actual === preg.correcta) {
                confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, zIndex: 9999 });
            } else {
                const caca = confetti.shapeFromText({ text: '💩', scalar: 4 });
                confetti({ shapes: [caca], scalar: 3, particleCount: 40, spread: 80, origin: { y: 0.6 }, zIndex: 9999 });
            }
        }
    }

    switch (state.estado) {
        case 'sala': actualizarSalaUI(state); break;
        case 'preguntas': actualizarPreguntasUI(state); break;
        case 'ranking': actualizarRankingUI(state); break;
        case 'resultados': actualizarResultadosUI(state); break;
        case 'inicio': window.location.reload(); break;
    }
}

// ========================
// VISTAS
// ========================

function actualizarSalaUI(state) {
    const lista = document.getElementById('lista-jugadores');
    if (lista.children.length !== state.jugadores.length) {
        lista.innerHTML = '';
        state.jugadores.forEach(j => {
            const li = document.createElement('li');
            li.textContent = j.nombre;
            if(j.id === miId) li.classList.add('me');
            lista.appendChild(li);
        });
        document.getElementById('contador-jugadores').textContent = state.jugadores.length;
    }
}

function actualizarPreguntasUI(state) {
    const preg = bancoPreguntas[state.preguntaIdx];
    if (!preg) return;

    document.getElementById('num-pregunta-actual').textContent = state.preguntaIdx + 1;
    document.getElementById('total-preguntas').textContent = bancoPreguntas.length;
    document.getElementById('texto-pregunta').textContent = preg.pregunta;

    document.getElementById('timer-text').textContent = state.tiempo;
    const timerDiv = document.querySelector('.timer');
    if (state.tiempo <= 3 && state.tiempo > 0) {
        timerDiv.classList.add('warning');
    } else {
        timerDiv.classList.remove('warning');
    }

    const botones = document.querySelectorAll('.option-btn');
    botones.forEach((btn, idx) => {
        btn.querySelector('.opt-text').textContent = preg.opciones[idx];
        
        if (state.mostrarCorrecta) {
            btn.disabled = true;
            if (idx === preg.correcta) {
                btn.classList.add('correct');
            } else {
                btn.classList.add('wrong');
            }
        }
    });

    if (miRol === 'jugador') {
        const miJugador = state.jugadores.find(j => j.id === miId);
        if (miJugador && miJugador.respuesta_actual !== null && !state.mostrarCorrecta) {
            botones.forEach(b => b.disabled = true);
            document.getElementById('mensaje-respondido').classList.remove('hidden');
        }
    }
}

function actualizarRankingUI(state) {
    const ranking = [...state.jugadores].sort((a,b) => b.puntos - a.puntos);
    const lista = document.getElementById('lista-ranking');
    lista.innerHTML = '';
    
    ranking.slice(0, 5).forEach((j, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<div class="name"><span>${i + 1}.</span> ${j.nombre}</div><div class="score">${j.puntos}</div>`;
        if(j.id === miId) li.classList.add('me');
        lista.appendChild(li);
    });
}

function actualizarResultadosUI(state) {
    const ranking = [...state.jugadores].sort((a,b) => b.puntos - a.puntos);
    const ganador = ranking[0];

    if(ganador) {
        document.getElementById('texto-ganador').textContent = ganador.nombre;
        document.getElementById('puntos-ganador').textContent = ganador.puntos;
    }

    const lista = document.getElementById('lista-ranking-final');
    lista.innerHTML = '';
    ranking.slice(0, 5).forEach((j, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<div class="name"><span>${i + 1}.</span> ${j.nombre}</div><div class="score">${j.puntos}</div>`;
        if(j.id === miId) li.classList.add('me');
        lista.appendChild(li);
    });
}

// ========================
// HOST / ADMIN CONTROL
// ========================
function iniciarCicloPreguntaAdmin() {
    localStorage.setItem('k_estado', 'preguntas');
    localStorage.setItem('k_tiempo', TIEMPO_PREGUNTA.toString());
    localStorage.setItem('k_mostrar_correcta', 'false');

    let js =JSON.parse(localStorage.getItem('k_jugadores') || '[]');
    js.forEach(j => {
        j.respuesta_actual = null;
        j.tiempo_respuesta = 0;
    });
    actualizarJugadores(js);

    if(timerActivo) clearInterval(timerActivo);
    
    timerActivo = setInterval(() => {
        let t = parseInt(localStorage.getItem('k_tiempo'));
        t--;
        localStorage.setItem('k_tiempo', t.toString());

        if (t <= 0) {
            clearInterval(timerActivo);
            finalizarPreguntaAdmin();
        }
    }, 1000);
}

function finalizarPreguntaAdmin() {
    localStorage.setItem('k_mostrar_correcta', 'true');
    const idx = parseInt(localStorage.getItem('k_pregunta_idx'));
    const correcta = bancoPreguntas[idx].correcta;
    
    let js =JSON.parse(localStorage.getItem('k_jugadores') || '[]');
    js.forEach(j => {
        if (j.respuesta_actual === correcta) {
            const max = 1000;
            const puntosBase = max / 2;
            const extraTiempo = j.tiempo_respuesta / TIEMPO_PREGUNTA * (max / 2);
            j.puntos += Math.round(puntosBase + extraTiempo);
        }
    });
    actualizarJugadores(js);

    setTimeout(() => {
        localStorage.setItem('k_estado', 'ranking');
    }, 4000);
}

function enviarRespuestaJugador(idx_opcion) {
    const st = obtenerEstado();
    if (st.estado !== 'preguntas' || st.mostrarCorrecta) return;

    let encontrado = false;
    for (let i = 0; i < st.jugadores.length; i++) {
        if (st.jugadores[i].id === miId) {
            if (st.jugadores[i].respuesta_actual === null) {
                st.jugadores[i].respuesta_actual = idx_opcion;
                st.jugadores[i].tiempo_respuesta = st.tiempo;
                encontrado = true;
            }
            break;
        }
    }
    
    if(encontrado) {
        document.querySelectorAll('.option-btn').forEach(b => b.style.opacity = '0.5');
        actualizarJugadores(st.jugadores);
    }
}
