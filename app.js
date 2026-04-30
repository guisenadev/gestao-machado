import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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

let properties = [];
let isLoginMode = true;

// Monitoramento de Login
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
    // Simplificado para evitar erro de índice
    const q = query(collection(db, "imoveis"), where("userId", "==", uid));
    onSnapshot(q, (snapshot) => {
        properties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAll();
    }, (error) => {
        console.error("Erro no banco:", error);
    });
}

function renderAll() {
    renderStats();
    const homeList = document.getElementById('home-list');
    homeList.innerHTML = '';
    
    // Ordenação via código para evitar erros de índice no Firebase
    const sorted = [...properties].sort((a, b) => a.inquilino.localeCompare(b.inquilino));
    
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
        <div class="compact-card" style="opacity: ${isPaid ? '0.7' : '1'}" onclick="editProperty('${p.id}')">
            <div class="card-top">
                <span class="card-title">${p.inquilino}</span>
                <span class="status-indicator status-${status}">${label}</span>
            </div>
            <div class="card-address">📍 ${p.endereco} • Dia ${p.vencimento}</div>
            <div style="font-size: 16px; font-weight: 800; margin-bottom: 12px; color: var(--primary);">${valor}</div>
            <div class="card-actions">
                <button class="btn-action btn-wa" onclick="sendWhatsApp(event, '${p.id}')">📲 COBRAR</button>
                ${!isPaid ? `<button class="btn-action btn-pay" onclick="event.stopPropagation(); markAsPaid('${p.id}')">✅ BAIXA</button>` : `<button class="btn-action" style="background:#f0f0f0;color:#666;" onclick="event.stopPropagation(); undoPayment('${p.id}')">↩️ DESFAZER</button>`}
            </div>
        </div>
    `;
}

function getPropStatus(p) {
    const d = new Date();
    const currentMonth = (d.getMonth() + 1) + "/" + d.getFullYear();
    if (p.lastPaymentMonth === currentMonth) return 'paid';
    const today = d.getDate();
    if (today > p.vencimento) return 'late';
    if (p.vencimento - today <= 5) return 'near';
    return 'in-day';
}

window.saveProperty = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = "SALVANDO...";

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

        // Se houver arquivo, tenta subir
        if (fileInput.files[0]) {
            try {
                const sRef = ref(storage, `contratos/${docRef.id || id}`);
                await uploadBytes(sRef, fileInput.files[0]);
                const url = await getDownloadURL(sRef);
                await updateDoc(docRef.id ? docRef : doc(db, "imoveis", id), { contratoURL: url, hasContract: true });
            } catch (storageErr) {
                console.warn("Storage não habilitado ou erro no upload:", storageErr);
                alert("Imóvel salvo, mas o contrato não pôde ser enviado (habilite o Storage no console).");
            }
        }
        
        closeModal('property-modal');
    } catch (err) {
        console.error("Erro ao salvar imóvel:", err);
        alert("Erro ao salvar: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "SALVAR";
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
    if(!email || !pass) return alert("Preencha e-mail e senha.");
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

window.closeModal = (id) => { document.getElementById(id).style.display = 'none'; };

window.editProperty = (id) => {
    const p = properties.find(x => x.id === id);
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
    if (confirm('Excluir imóvel?')) {
        await deleteDoc(doc(db, "imoveis", id));
        closeModal('property-modal');
    }
};

window.sendWhatsApp = (e, id) => {
    e.stopPropagation();
    const p = properties.find(x => x.id === id);
    const d = new Date();
    const today = d.getDate();
    const diff = today - p.vencimento;
    const valor = (p.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    let msg = today > p.vencimento ? `Olá *${p.inquilino}*, notei que o aluguel de *${valor}* (vencimento dia ${p.vencimento}) está com *${diff} dias de atraso*. Poderia verificar?` : `Oi *${p.inquilino}*, lembrete do aluguel (dia ${p.vencimento}). Qualquer dúvida me avise!`;
    window.open(`https://wa.me/55${p.telefone}?text=${encodeURIComponent(msg)}`, '_blank');
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
        acc.total++;
        if (s === 'paid') acc.paid++; else acc.pending++;
        if (s !== 'paid') acc.rev += (p.valor || 0);
        if (s === 'late') acc.late++;
        return acc;
    }, { total: 0, paid: 0, pending: 0, late: 0, rev: 0 });
    const revEl = document.getElementById('stat-revenue');
    if(revEl) revEl.innerText = stats.rev.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const paidEl = document.getElementById('stat-paid');
    if(paidEl) paidEl.innerText = stats.paid;
    const pendEl = document.getElementById('stat-pending');
    if(pendEl) pendEl.innerText = stats.pending;
    const b = document.getElementById('alert-banner');
    if (b && stats.late > 0) { b.style.display = 'flex'; document.getElementById('alert-text').innerText = `${stats.late} atrasados!`; }
    else if(b) b.style.display = 'none';
}
