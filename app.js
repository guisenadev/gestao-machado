import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyBs0vG4R9XJ...", 
    authDomain: "gestaomachado.firebaseapp.com",
    projectId: "gestaomachado",
    storageBucket: "gestaomachado.appspot.com",
    messagingSenderId: "673603249899",
    appId: "1:673603249899:web:9f8e7d..."
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let properties = [];
let currentFilter = 'all';
let isLoginMode = true;

// Monitoramento Auth
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-content').classList.remove('hidden');
        document.getElementById('user-display').innerText = user.email.split('@')[0];
        listenToProperties(user.uid);
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-content').classList.add('hidden');
    }
});

function listenToProperties(uid) {
    const q = query(collection(db, "imoveis"), where("userId", "==", uid), orderBy("inquilino", "asc"));
    onSnapshot(q, (snapshot) => {
        properties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAll();
    });
}

// Renderização Principal
function renderAll() {
    renderStats();
    
    // Lista da Home (Ordenada por Pendentes/Atrasados)
    const homeList = document.getElementById('home-list');
    homeList.innerHTML = '';
    const sorted = [...properties].sort((a, b) => {
        const sA = getPropStatus(a);
        const sB = getPropStatus(b);
        if (sA === 'late') return -1;
        if (sA === 'near' && sB !== 'late') return -1;
        return 1;
    });
    sorted.slice(0, 10).forEach(p => homeList.innerHTML += createCompactCard(p));

    renderProperties();
    renderContracts();
}

function createCompactCard(p) {
    const status = getPropStatus(p);
    const label = status === 'paid' ? 'Pago' : status === 'late' ? 'Atrasado' : status === 'near' ? 'Vencendo' : 'Em dia';
    const valor = (p.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    return `
        <div class="compact-card" onclick="editProperty('${p.id}')">
            <div class="card-top">
                <span class="card-title">${p.inquilino}</span>
                <span class="status-indicator status-${status}">${label}</span>
            </div>
            <div class="card-address">📍 ${p.endereco} • Dia ${p.vencimento}</div>
            <div style="font-size: 14px; font-weight: 800; margin-bottom: 12px;">${valor}</div>
            <div class="card-actions">
                <button class="btn-action btn-wa" onclick="sendWhatsApp(event, '${p.id}')">
                    <span>📲</span> COBRAR
                </button>
                ${status !== 'paid' ? `
                <button class="btn-action btn-pay" onclick="event.stopPropagation(); markAsPaid('${p.id}')">
                    <span>✅</span> BAIXA
                </button>` : ''}
            </div>
        </div>
    `;
}

// Lógica de Status
function getPropStatus(p) {
    const currentMonth = (new Date().getMonth() + 1) + "/" + new Date().getFullYear();
    if (p.lastPaymentMonth === currentMonth) return 'paid';
    const today = new Date().getDate();
    if (today > p.vencimento) return 'late';
    if (p.vencimento - today <= 5) return 'near';
    return 'in-day';
}

function renderStats() {
    const stats = properties.reduce((acc, p) => {
        const s = getPropStatus(p);
        acc.total++;
        acc.revenue += (p.valor || 0);
        if (s === 'paid') acc.paid++; else acc.pending++;
        if (s === 'late') acc.late++;
        return acc;
    }, { total: 0, revenue: 0, paid: 0, pending: 0, late: 0 });

    document.getElementById('stat-revenue').innerText = stats.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('stat-paid').innerText = stats.paid;
    document.getElementById('stat-pending').innerText = stats.pending;

    const banner = document.getElementById('alert-banner');
    if (stats.late > 0) {
        banner.style.display = 'flex';
        document.getElementById('alert-text').innerText = `${stats.late} aluguéis atrasados!`;
    } else banner.style.display = 'none';
}

// Funções Globais (Window)
window.handleAuth = async () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    const btn = document.getElementById('btn-login');
    if(!email || !pass) return alert("Preencha tudo.");
    btn.disabled = true;
    try {
        if (isLoginMode) await signInWithEmailAndPassword(auth, email, pass);
        else await createUserWithEmailAndPassword(auth, email, pass);
    } catch (e) { alert("Erro: " + e.message); }
    btn.disabled = false;
};

window.toggleAuthMode = () => {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-switch-text').innerText = isLoginMode ? "Novo por aqui?" : "Já tem conta?";
    document.getElementById('auth-switch-link').innerText = isLoginMode ? "Cadastre-se" : "Entrar";
    document.getElementById('btn-login').innerText = isLoginMode ? "ENTRAR" : "CADASTRAR";
};

window.handleLogout = () => { if(confirm("Sair?")) signOut(auth); };

window.saveProperty = async (e) => {
    e.preventDefault();
    const id = document.getElementById('prop-id').value;
    const fileInput = document.getElementById('prop-file');
    const data = {
        userId: auth.currentUser.uid,
        inquilino: document.getElementById('prop-name').value,
        telefone: document.getElementById('prop-phone').value.replace(/\D/g, ''),
        endereco: document.getElementById('prop-address').value,
        valor: parseFloat(document.getElementById('prop-value').value),
        vencimento: parseInt(document.getElementById('prop-due').value),
        updatedAt: new Date()
    };

    try {
        let docRef;
        if (id) {
            docRef = doc(db, "imoveis", id);
            await updateDoc(docRef, data);
        } else {
            docRef = await addDoc(collection(db, "imoveis"), data);
        }

        if (fileInput.files[0]) {
            const sRef = ref(storage, `contratos/${docRef.id}`);
            await uploadBytes(sRef, fileInput.files[0]);
            const url = await getDownloadURL(sRef);
            await updateDoc(docRef, { contratoURL: url, hasContract: true });
        }
        closeModal('property-modal');
    } catch (e) { alert("Erro ao salvar."); }
};

window.markAsPaid = async (id) => {
    const month = (new Date().getMonth() + 1) + "/" + new Date().getFullYear();
    if (confirm(`Confirmar pagamento de ${month}?`)) {
        await updateDoc(doc(db, "imoveis", id), { lastPaymentMonth: month });
    }
};

window.sendWhatsApp = (e, id) => {
    e.stopPropagation();
    const p = properties.find(x => x.id === id);
    const msg = `Olá *${p.inquilino}*, lembrete do aluguel (dia ${p.vencimento}). Consegue verificar?`;
    window.open(`https://wa.me/55${p.telefone}?text=${encodeURIComponent(msg)}`, '_blank');
};

window.switchTab = (tab, el) => {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
};

window.openModal = (id) => {
    document.getElementById(id).style.display = 'flex';
    document.getElementById('property-form').reset();
    document.getElementById('prop-id').value = '';
};

window.closeModal = (id) => { document.getElementById(id).style.display = 'none'; };

window.editProperty = (id) => {
    const p = properties.find(x => x.id === id);
    openModal('property-modal');
    document.getElementById('prop-id').value = p.id;
    document.getElementById('prop-name').value = p.inquilino;
    document.getElementById('prop-phone').value = p.telefone;
    document.getElementById('prop-address').value = p.endereco;
    document.getElementById('prop-value').value = p.valor;
    document.getElementById('prop-due').value = p.vencimento;
    document.getElementById('delete-btn').classList.remove('hidden');
};

window.renderProperties = () => {
    const list = document.getElementById('full-list');
    list.innerHTML = '';
    properties.forEach(p => list.innerHTML += createCompactCard(p));
};

window.renderContracts = () => {
    const list = document.getElementById('contracts-list');
    list.innerHTML = '';
    properties.filter(p => p.hasContract).forEach(p => {
        list.innerHTML += `
            <div class="compact-card" style="flex-direction: row; justify-content: space-between; align-items: center;">
                <div>
                    <b>${p.inquilino}</b>
                    <div style="font-size: 12px; color: #666;">Contrato</div>
                </div>
                <button class="btn-action" style="width: auto; padding: 10px 20px; background: #e8f9ed; color: var(--primary);" onclick="window.open('${p.contratoURL}', '_blank')">ABRIR</button>
            </div>
        `;
    });
};
