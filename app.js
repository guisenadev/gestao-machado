import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyAKttJZrl3JWweG3TIGd3I3DsezWTn1L1Y",
    authDomain: "gestaomachado.firebaseapp.com",
    projectId: "gestaomachado",
    storageBucket: "gestaomachado.firebasestorage.app",
    messagingSenderId: "673603249899",
    appId: "1:673603249899:web:4e1dfb4bfecbdd020e00ae"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

setPersistence(auth, browserLocalPersistence);

let properties = [];
let isLoginMode = true;

onAuthStateChanged(auth, (user) => {
    const splash = document.getElementById('loading-screen');
    if (user) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-content').classList.remove('hidden');
        document.getElementById('user-display').innerText = user.email.split('@')[0];
        listenToProperties(user.uid);
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-content').classList.add('hidden');
    }
    if(splash) splash.style.display = 'none';
});

function listenToProperties(uid) {
    const q = query(collection(db, "imoveis"), where("userId", "==", uid));
    onSnapshot(q, (snapshot) => {
        properties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAll();
    });
}

function renderAll() {
    renderStats();
    const homeList = document.getElementById('home-list');
    if(!homeList) return;
    homeList.innerHTML = '';
    const sorted = [...properties].sort((a, b) => (a.inquilino || "").localeCompare(b.inquilino || ""));
    sorted.forEach(p => homeList.innerHTML += createCompactCard(p));
    renderProperties();
    renderContracts();
}

function createCompactCard(p) {
    const status = getPropStatus(p);
    const isPaid = status === 'paid';
    const label = isPaid ? 'Pago ✅' : status === 'late' ? 'Atrasado 🔴' : status === 'near' ? 'Vencendo 🟡' : 'Em dia 🟢';
    const valor = (p.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    return `
        <div class="compact-card" style="opacity: ${isPaid ? '0.7' : '1'}">
            <div class="card-top">
                <span class="card-title">${p.inquilino}</span>
                <button class="btn-edit-small" onclick="editProperty('${p.id}')">✏️ EDITAR</button>
            </div>
            <div class="card-address">📍 ${p.endereco} • Dia ${p.vencimento}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div style="font-size: 16px; font-weight: 800; color: var(--primary);">${valor}</div>
                <span class="status-indicator status-${status}">${label}</span>
            </div>
            <div class="card-actions">
                <button class="btn-action btn-wa" onclick="sendWhatsApp(event, '${p.id}')">📲 COBRAR</button>
                ${!isPaid ? `<button class="btn-action btn-pay" onclick="event.stopPropagation(); markAsPaid('${p.id}')">✅ BAIXA</button>` : `<button class="btn-action" style="background:#f0f0f0;color:#666;" onclick="event.stopPropagation(); undoPayment('${p.id}')">↩️ DESFAZER</button>`}
            </div>
        </div>
    `;
}

function getPropStatus(p) {
    const d = new Date();
    const month = (d.getMonth() + 1) + "/" + d.getFullYear();
    if (p.lastPaymentMonth === month) return 'paid';
    if (d.getDate() > p.vencimento) return 'late';
    if (p.vencimento - d.getDate() <= 5) return 'near';
    return 'in-day';
}

window.saveProperty = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    const id = document.getElementById('prop-id').value;
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
        const file = document.getElementById('prop-file').files[0];
        if (file) {
            const sRef = ref(storage, `contratos/${docRef.id || id}`);
            await uploadBytes(sRef, file);
            const url = await getDownloadURL(sRef);
            await updateDoc(doc(db, "imoveis", docRef.id || id), { contratoURL: url, hasContract: true });
        }
        closeModal('property-modal');
    } catch (e) { alert("Erro ao salvar."); }
    btn.disabled = false;
};

window.editProperty = (id) => {
    const p = properties.find(x => x.id === id);
    if(!p) return;
    openModal('property-modal');
    document.getElementById('modal-title').innerText = 'Editar Imóvel';
    document.getElementById('prop-id').value = p.id;
    document.getElementById('prop-name').value = p.inquilino;
    document.getElementById('prop-phone').value = p.telefone;
    document.getElementById('prop-address').value = p.endereco;
    document.getElementById('prop-value').value = p.valor;
    document.getElementById('prop-due').value = p.vencimento;
    document.getElementById('delete-btn').classList.remove('hidden');
};

window.deleteProperty = async () => {
    const id = document.getElementById('prop-id').value;
    if (!id) return;
    
    if (confirm('Deseja realmente EXCLUIR este imóvel? Os dados sumirão da nuvem.')) {
        try {
            // 1. Fecha o modal primeiro para dar feedback imediato
            closeModal('property-modal');
            
            // 2. Deleta do banco
            await deleteDoc(doc(db, "imoveis", id));
            
            // 3. Tenta deletar contrato (opcional)
            try { await deleteObject(ref(storage, `contratos/${id}`)); } catch(e) {}
            
            if (navigator.vibrate) navigator.vibrate(100);
            console.log("Imóvel excluído:", id);
        } catch (error) {
            alert("Erro ao excluir: " + error.message);
        }
    }
};

window.markAsPaid = async (id) => {
    const month = (new Date().getMonth() + 1) + "/" + new Date().getFullYear();
    if (confirm(`Confirmar pagamento de ${month}?`)) {
        await updateDoc(doc(db, "imoveis", id), { lastPaymentMonth: month });
    }
};

window.undoPayment = async (id) => {
    if (confirm("Desfazer baixa?")) {
        await updateDoc(doc(db, "imoveis", id), { lastPaymentMonth: "" });
    }
};

window.handleAuth = async () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    try {
        if (isLoginMode) await signInWithEmailAndPassword(auth, email, pass);
        else await createUserWithEmailAndPassword(auth, email, pass);
    } catch (e) { alert("Acesso negado."); }
    btn.disabled = false;
};

window.toggleAuthMode = () => {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-switch-text').innerText = isLoginMode ? "Novo por aqui?" : "Já tem conta?";
    document.getElementById('auth-switch-link').innerText = isLoginMode ? "Cadastre-se" : "Entrar";
    document.getElementById('btn-login').innerText = isLoginMode ? "ENTRAR" : "CADASTRAR";
};

window.handleLogout = () => { if(confirm("Sair?")) signOut(auth); };

window.sendWhatsApp = (e, id) => {
    e.stopPropagation();
    const p = properties.find(x => x.id === id);
    const msg = `Olá *${p.inquilino}*, lembrete do aluguel (dia ${p.vencimento}). Qualquer dúvida me avise!`;
    window.open(`https://wa.me/55${p.telefone}?text=${encodeURIComponent(msg)}`, '_blank');
};

window.switchTab = (tab, el) => {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    renderAll();
};

window.openModal = (id) => {
    document.getElementById(id).style.display = 'flex';
    document.getElementById('property-form').reset();
    document.getElementById('prop-id').value = '';
    document.getElementById('delete-btn').classList.add('hidden');
};

window.closeModal = (id) => { 
    document.getElementById(id).style.display = 'none'; 
};

window.renderProperties = () => {
    const list = document.getElementById('full-list');
    if(!list) return;
    list.innerHTML = '';
    properties.forEach(p => list.innerHTML += createCompactCard(p));
};

window.renderContracts = () => {
    const list = document.getElementById('contracts-list');
    if(!list) return;
    list.innerHTML = '';
    properties.filter(p => p.hasContract).forEach(p => {
        list.innerHTML += `<div class="compact-card" style="flex-direction:row;justify-content:space-between;align-items:center;"><div><b>${p.inquilino}</b></div><button class="btn-action" style="width:auto;padding:10px 20px;background:#e8f9ed;color:var(--primary);" onclick="window.open('${p.contratoURL}', '_blank')">ABRIR</button></div>`;
    });
};

function renderStats() {
    const stats = properties.reduce((acc, p) => {
        const s = getPropStatus(p);
        if (s === 'paid') acc.paid++; else acc.pending++;
        if (s !== 'paid') acc.rev += (p.valor || 0);
        if (s === 'late') acc.late++;
        return acc;
    }, { paid: 0, pending: 0, late: 0, rev: 0 });
    const elRev = document.getElementById('stat-revenue');
    if(elRev) elRev.innerText = stats.rev.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const elPaid = document.getElementById('stat-paid');
    if(elPaid) elPaid.innerText = stats.paid;
    const elPend = document.getElementById('stat-pending');
    if(elPend) elPend.innerText = stats.pending;
    const b = document.getElementById('alert-banner');
    if (b && stats.late > 0) { b.style.display = 'flex'; document.getElementById('alert-text').innerText = `${stats.late} atrasados!`; }
    else if(b) b.style.display = 'none';
}
