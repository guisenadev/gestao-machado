import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBs0vG4R9XJ...", 
    authDomain: "gestaomachado.firebaseapp.com",
    projectId: "gestaomachado",
    storageBucket: "gestaomachado.appspot.com",
    messagingSenderId: "673603249899",
    appId: "1:673603249899:web:9f8e7d..."
};

// Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Estado Global
let properties = [];
let currentFilter = 'all';
let isLoginMode = true;
let currentUser = null;

// Monitoramento de Autenticação
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-content').classList.remove('hidden');
        document.getElementById('user-display').innerText = user.email.split('@')[0];
        listenToProperties();
    } else {
        currentUser = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-content').classList.add('hidden');
    }
});

// Listener em Tempo Real (Filtrado por Usuário)
function listenToProperties() {
    if (!currentUser) return;
    const q = query(
        collection(db, "imoveis"), 
        where("userId", "==", currentUser.uid),
        orderBy("inquilino", "asc")
    );
    
    onSnapshot(q, (snapshot) => {
        properties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAll();
    });
}

// Lógica de Autenticação
window.handleAuth = async () => {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('btn-login');
    
    if (!email || !password) return alert("Preencha todos os campos.");
    
    btn.disabled = true;
    btn.innerText = "PROCESSANDO...";

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        console.error(error);
        alert("Erro na autenticação: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerText = isLoginMode ? "ENTRAR" : "CADASTRAR";
    }
};

window.toggleAuthMode = () => {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? "GESTÃO MACHADO" : "CRIAR CONTA";
    document.getElementById('btn-login').innerText = isLoginMode ? "ENTRAR" : "CADASTRAR";
    document.getElementById('auth-switch-text').innerText = isLoginMode ? "Não tem uma conta?" : "Já tem uma conta?";
    document.getElementById('auth-switch-link').innerText = isLoginMode ? "Cadastre-se" : "Entrar";
};

window.handleLogout = () => {
    if (confirm("Deseja sair da sua conta?")) signOut(auth);
};

// Salvar Imóvel (Com userId)
window.saveProperty = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const id = document.getElementById('prop-id').value;
    const fileInput = document.getElementById('prop-file');
    
    const propData = {
        userId: currentUser.uid,
        inquilino: document.getElementById('prop-name').value,
        telefone: document.getElementById('prop-phone').value.replace(/\D/g, ''),
        endereco: document.getElementById('prop-address').value,
        valor: parseFloat(document.getElementById('prop-value').value),
        vencimento: parseInt(document.getElementById('prop-due').value),
        observacoes: document.getElementById('prop-notes').value,
        lastPaymentMonth: properties.find(p => p.id === id)?.lastPaymentMonth || null,
        updatedAt: new Date()
    };

    try {
        let docRef;
        if (id) {
            docRef = doc(db, "imoveis", id);
            await updateDoc(docRef, propData);
        } else {
            propData.createdAt = new Date();
            docRef = await addDoc(collection(db, "imoveis"), propData);
        }

        if (fileInput.files[0]) {
            const storageRef = ref(storage, `contratos/${docRef.id}`);
            await uploadBytes(storageRef, fileInput.files[0]);
            const url = await getDownloadURL(storageRef);
            await updateDoc(docRef, { contratoURL: url, hasContract: true });
        }
        closeModal('property-modal');
    } catch (e) { alert("Erro ao salvar."); }
};

// Dar Baixa no Pagamento
window.markAsPaid = async (id) => {
    vibrate(50);
    const currentMonth = new Date().getMonth() + 1 + "/" + new Date().getFullYear();
    if (confirm(`Confirmar recebimento do aluguel deste mês (${currentMonth})?`)) {
        try {
            await updateDoc(doc(db, "imoveis", id), {
                lastPaymentMonth: currentMonth,
                lastPaymentDate: new Date()
            });
        } catch (e) { alert("Erro ao registrar pagamento."); }
    }
};

// Renderização
function renderAll() {
    renderStats();
    renderRecent();
    if (!document.getElementById('tab-properties').classList.contains('hidden')) renderProperties();
    if (!document.getElementById('tab-contracts').classList.contains('hidden')) renderContracts();
}

function getPropStatus(p) {
    const currentMonth = new Date().getMonth() + 1 + "/" + new Date().getFullYear();
    if (p.lastPaymentMonth === currentMonth) return 'paid';
    
    const today = new Date().getDate();
    if (today > p.vencimento) return 'late';
    if (p.vencimento - today <= 5) return 'near';
    return 'in-day';
}

function renderStats() {
    const stats = properties.reduce((acc, p) => {
        const status = getPropStatus(p);
        acc.total++;
        acc.revenue += (p.valor || 0);
        if (status === 'paid') acc.paid++;
        else acc.pending++;
        if (status === 'late') acc.lateCount++;
        return acc;
    }, { total: 0, revenue: 0, paid: 0, pending: 0, lateCount: 0 });

    document.getElementById('stat-total').innerText = stats.total;
    document.getElementById('stat-revenue').innerText = stats.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('stat-paid').innerText = stats.paid;
    document.getElementById('stat-pending').innerText = stats.pending;

    const banner = document.getElementById('alert-banner');
    banner.style.display = stats.lateCount > 0 ? 'flex' : 'none';
    if(stats.lateCount > 0) document.getElementById('alert-text').innerText = `${stats.lateCount} aluguéis em atraso!`;
}

function createPropertyCard(p) {
    const status = getPropStatus(p);
    const label = status === 'paid' ? 'Pago ✅' : 
                 status === 'late' ? 'Atrasado 🔴' : 
                 status === 'near' ? 'Vencendo 🟡' : 'Em dia 🟢';
    
    const showPayBtn = status !== 'paid';

    return `
        <div class="property-card" onclick="editProperty('${p.id}')">
            <div style="display: flex; justify-content: space-between;">
                <h3 style="font-size: 18px;">${p.inquilino}</h3>
                <span class="status-badge status-${status}">${label}</span>
            </div>
            <div style="font-size: 13px; color: #666; margin: 10px 0;">📍 ${p.endereco}</div>
            <div style="background: #f8f9fa; padding: 10px; border-radius: 12px; font-size: 14px;">
                <b>Vence dia ${p.vencimento}</b> • R$ ${p.valor.toLocaleString('pt-BR')}
            </div>
            <div style="display: flex; gap: 8px; margin-top: 15px;">
                <button class="btn btn-whatsapp" style="margin-top:0; flex: 1;" onclick="sendWhatsApp(event, '${p.id}')">COBRAR</button>
                ${showPayBtn ? `<button class="btn" style="background: var(--primary); color: white; flex: 1; font-size: 14px;" onclick="event.stopPropagation(); markAsPaid('${p.id}')">DAR BAIXA</button>` : ''}
            </div>
        </div>
    `;
}

// ... (Funções auxiliares como editProperty, renderProperties, renderContracts, setupMasks, vibrate, vibrate etc. permanecem com a lógica adaptada) ...

window.renderProperties = () => {
    const list = document.getElementById('full-property-list');
    const search = document.getElementById('search-input').value.toLowerCase();
    list.innerHTML = '';
    properties.filter(p => {
        const matchesSearch = p.inquilino.toLowerCase().includes(search) || p.endereco.toLowerCase().includes(search);
        const status = getPropStatus(p);
        const matchesFilter = currentFilter === 'all' || currentFilter === status;
        return matchesSearch && matchesFilter;
    }).forEach(p => list.innerHTML += createPropertyCard(p));
};

window.editProperty = (id) => {
    const p = properties.find(prop => prop.id === id);
    openModal('property-modal');
    document.getElementById('modal-title').innerText = 'Editar Imóvel';
    document.getElementById('prop-id').value = p.id;
    document.getElementById('prop-name').value = p.inquilino;
    document.getElementById('prop-phone').value = p.telefone;
    document.getElementById('prop-address').value = p.endereco;
    document.getElementById('prop-value').value = p.valor;
    document.getElementById('prop-due').value = p.vencimento;
    document.getElementById('prop-notes').value = p.observacoes;
    document.getElementById('delete-btn').classList.remove('hidden');
};

window.deleteProperty = async () => {
    const id = document.getElementById('prop-id').value;
    if (confirm('Excluir este imóvel permanentemente?')) {
        await deleteDoc(doc(db, "imoveis", id));
        closeModal('property-modal');
    }
};

window.sendWhatsApp = (e, id) => {
    e.stopPropagation();
    const p = properties.find(prop => prop.id === id);
    const msg = `Olá *${p.inquilino}*, lembrete do aluguel de R$ ${p.valor} (vencimento dia ${p.vencimento}). Consegue verificar?`;
    window.open(`https://wa.me/55${p.telefone}?text=${encodeURIComponent(msg)}`, '_blank');
};

window.openModal = (id) => {
    document.getElementById(id).style.display = 'flex';
};

window.closeModal = (id) => {
    document.getElementById(id).style.display = 'none';
};

function setupMasks() {
    const phone = document.getElementById('prop-phone');
    if(phone) phone.addEventListener('input', (e) => {
        let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
        e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
    });
}

function vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); }
