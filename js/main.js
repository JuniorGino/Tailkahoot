const TIEMPO_PREGUNTA = 10;

const firebaseConfig = {
    apiKey: "AIzaSyAQnM5jLt_3KKd2cpVxhJwhuyKr8iL-7oQ",
    authDomain: "gino-45cb1.firebaseapp.com",
    databaseURL: "https://gino-45cb1-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "gino-45cb1",
    storageBucket: "gino-45cb1.firebasestorage.app",
    messagingSenderId: "725127268465",
    appId: "1:725127268465:web:7134207d25be0cc2fdf3d0"
};

// Inicializar Firebase Solo si se ha cambiado la API Key por defecto
let db = null;
try {
    if (firebaseConfig.apiKey !== "TU_API_KEY") {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
    } else {
        console.warn("FALTA FIREBASE: Recuerda configurar tus claves en js/main.js");
    }
} catch (e) {
    console.error("Error al iniciar Firebase", e);
}


// Variables Locales
let miRol = null; // 'admin' o 'jugador'
let miId = 'id_' + Math.random().toString(36).substr(2, 9);
let miNombre = '';
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
// COMUNICACIÓN (FIREBASE REALTIME DATABASE)
// ========================

let estado_actual = null;

function initEstadoGlobal() {
    if(!db) return;
    
    db.ref('partida').on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            // No existe la partida aún, esperamos a que inicie el Admin
        } else {
            estado_actual = data;
            // Si el usuario ya entró a la sala o más adelante, renderizamos automáticamente
            if (miRol !== null || data.estado === "inicio") {
                renderizarUI(obtenerEstado());
            }
        }
    });
}

function limpiarJuegoGlobal() {
    if(!db) return;
    db.ref('partida').set({
        estado: 'inicio',
        jugadores: {},
        preguntaIdx: 0,
        tiempo: TIEMPO_PREGUNTA,
        mostrarCorrecta: false
    });
}

function obtenerEstado() {
    if (!estado_actual) {
        return {
            estado: 'inicio',
            jugadores: [],
            preguntaIdx: 0,
            tiempo: TIEMPO_PREGUNTA,
            mostrarCorrecta: false
        };
    }
    
    // De objeto de Firebase a Array
    const j_obj = estado_actual.jugadores || {};
    const j_arr = Object.values(j_obj);

    return {
        estado: estado_actual.estado || 'inicio',
        jugadores: j_arr,
        preguntaIdx: estado_actual.preguntaIdx || 0,
        tiempo: estado_actual.tiempo || TIEMPO_PREGUNTA,
        mostrarCorrecta: !!estado_actual.mostrarCorrecta
    };
}

function actualizarJugadores(nuevosJugadoresArr) {
    if(!db) return;
    let obj = {};
    nuevosJugadoresArr.forEach(j => { obj[j.id] = j; });
    db.ref('partida/jugadores').set(obj);
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
        if(!db) { alert("Falta configurar Firebase"); return;}
        limpiarJuegoGlobal();
        alert('Partida limpiada.');
    });

    // Admin
    document.getElementById('btn-entrar-admin').addEventListener('click', () => {
        if(!db) { alert("Falta configurar Firebase"); return;}
        miRol = 'admin';
        miNombre = 'ADMIN';
        document.body.classList.add('modo-admin');
        
        db.ref('partida').once('value').then(snap => {
            if(!snap.exists() || snap.val().estado === 'inicio') {
                limpiarJuegoGlobal();
            }
            db.ref('partida/estado').set('sala');
            iniciarSync();
        });
    });

    // Jugador
    document.getElementById('btn-entrar-jugador').addEventListener('click', () => {
        if(!db) { alert("Falta configurar Firebase"); return;}
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
            
            db.ref('partida/jugadores/' + miId).set({
                id: miId,
                nombre: miNombre,
                puntos: 0,
                respuesta_actual: null,
                tiempo_respuesta: 0
            });

            iniciarSync();
        } else {
            alert('Ingresa tu Identidad.');
        }
    });

    // Acciones exclusivas del Admin
    document.getElementById('btn-comenzar-juego').addEventListener('click', () => {
        if(miRol === 'admin') {
            db.ref('partida/preguntaIdx').set(0).then(() => {
                iniciarCicloPreguntaAdmin();
            });
        }
    });

    document.getElementById('btn-siguiente-pregunta').addEventListener('click', () => {
        if(miRol === 'admin') {
            let st = obtenerEstado();
            if(st.preguntaIdx + 1 < bancoPreguntas.length) {
                db.ref('partida/preguntaIdx').set(st.preguntaIdx + 1).then(() => {
                    iniciarCicloPreguntaAdmin();
                });
            } else {
                db.ref('partida/estado').set('resultados');
            }
        }
    });

    document.getElementById('btn-reiniciar-host').addEventListener('click', () => {
        if(miRol === 'admin') {
            limpiarJuegoGlobal();
            db.ref('partida/estado').set('sala');
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
        case 'inicio': 
            // Si estábamos en partida y de repente volvió a inicio, recargamos
            if (miRol) window.location.reload(); 
            break;
    }
}

// ========================
// VISTAS
// ========================

function actualizarSalaUI(state) {
    const lista = document.getElementById('lista-jugadores');
    // Para simplificar renderizado en Firebase, reconstruimos la lista
    lista.innerHTML = '';
    state.jugadores.forEach(j => {
        const li = document.createElement('li');
        li.textContent = j.nombre;
        if(j.id === miId) li.classList.add('me');
        lista.appendChild(li);
    });
    document.getElementById('contador-jugadores').textContent = state.jugadores.length;
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
    db.ref('partida/estado').set('preguntas');
    db.ref('partida/tiempo').set(TIEMPO_PREGUNTA);
    db.ref('partida/mostrarCorrecta').set(false);

    let jArr = obtenerEstado().jugadores;
    jArr.forEach(j => {
        j.respuesta_actual = null;
        j.tiempo_respuesta = 0;
    });
    actualizarJugadores(jArr);

    if(timerActivo) clearInterval(timerActivo);
    
    let t = TIEMPO_PREGUNTA;
    timerActivo = setInterval(() => {
        t--;
        db.ref('partida/tiempo').set(t);

        if (t <= 0) {
            clearInterval(timerActivo);
            finalizarPreguntaAdmin();
        }
    }, 1000);
}

function finalizarPreguntaAdmin() {
    db.ref('partida/mostrarCorrecta').set(true);
    
    // Obtenemos el estado actual directamente
    db.ref('partida').once('value').then(snap => {
        let actual = snap.val();
        let idx = actual.preguntaIdx;
        let correcta = bancoPreguntas[idx].correcta;
        
        let jObj = actual.jugadores || {};
        
        Object.values(jObj).forEach(j => {
            if (j.respuesta_actual === correcta) {
                const max = 1000;
                const puntosBase = max / 2;
                const extraTiempo = j.tiempo_respuesta / TIEMPO_PREGUNTA * (max / 2);
                j.puntos += Math.round(puntosBase + extraTiempo);
            }
        });
        
        db.ref('partida/jugadores').set(jObj);
    });

    setTimeout(() => {
        db.ref('partida/estado').set('ranking');
    }, 4000);
}

function enviarRespuestaJugador(idx_opcion) {
    const st = obtenerEstado();
    if (st.estado !== 'preguntas' || st.mostrarCorrecta) return;

    db.ref('partida/jugadores/' + miId + '/respuesta_actual').set(idx_opcion);
    db.ref('partida/jugadores/' + miId + '/tiempo_respuesta').set(st.tiempo);

    document.querySelectorAll('.option-btn').forEach(b => b.style.opacity = '0.5');
}
