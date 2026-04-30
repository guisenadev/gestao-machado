import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
const db = getFirestore(app);
const storage = getStorage(app);

// Estado Global
let properties = [];
let currentFilter = 'all';

// Inicialização ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    checkLogin();
    setupMasks();
    
    if (localStorage.getItem('isLoggedIn') === 'true') {
        listenToProperties();
    }
});

// Listener em Tempo Real (O coração do app profissional)
function listenToProperties() {
    const q = query(collection(db, "imoveis"), orderBy("inquilino", "asc"));
    onSnapshot(q, (snapshot) => {
        properties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAll();
    });
}

// Máscaras de Input
function setupMasks() {
    const phoneInput = document.getElementById('prop-phone');
    if(phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
            e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        });
    }
}

// Salvar Imóvel (Nuvem + Arquivo)
window.saveProperty = async function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = "SALVANDO...";
    btn.disabled = true;

    const id = document.getElementById('prop-id').value;
    const fileInput = document.getElementById('prop-file');
    const rawPhone = document.getElementById('prop-phone').value.replace(/\D/g, '');
    
    const propData = {
        inquilino: document.getElementById('prop-name').value,
        telefone: rawPhone,
        endereco: document.getElementById('prop-address').value,
        valor: parseFloat(document.getElementById('prop-value').value),
        vencimento: parseInt(document.getElementById('prop-due').value),
        observacoes: document.getElementById('prop-notes').value,
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

        // Upload de Contrato (Firebase Storage)
        if (fileInput.files[0]) {
            const file = fileInput.files[0];
            const storageRef = ref(storage, `contratos/${docRef.id}`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);
            await updateDoc(docRef, { contratoURL: downloadURL, hasContract: true });
        }

        vibrate(30);
        closeModal('property-modal');
    } catch (error) {
        console.error("Erro:", error);
        alert("Erro ao salvar na nuvem. Verifique sua conexão.");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

// Excluir Imóvel
window.deleteProperty = async function() {
    const id = document.getElementById('prop-id').value;
    if (confirm('Excluir este imóvel e todos os seus dados da nuvem?')) {
        try {
            await deleteDoc(doc(db, "imoveis", id));
            // Tenta deletar o contrato do Storage também
            try { await deleteObject(ref(storage, `contratos/${id}`)); } catch(e) {}
            vibrate(50);
            closeModal('property-modal');
        } catch (error) {
            alert("Erro ao excluir.");
        }
    }
};

// Renderização e UI
function renderAll() {
    renderStats();
    renderRecent();
    if (!document.getElementById('tab-properties').classList.contains('hidden')) {
        renderProperties();
    }
    if (!document.getElementById('tab-contracts').classList.contains('hidden')) {
        renderContracts();
    }
}

function renderStats() {
    const stats = properties.reduce((acc, p) => {
        const status = getStatus(p.vencimento);
        acc.total++;
        acc.revenue += (p.valor || 0);
        if (status === 'late') acc.late++;
        if (status === 'in-day' || status === 'near') acc.onTime++;
        return acc;
    }, { total: 0, revenue: 0, late: 0, onTime: 0 });

    document.getElementById('stat-total').innerText = stats.total;
    document.getElementById('stat-revenue').innerText = stats.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('stat-on-time').innerText = stats.onTime;
    document.getElementById('stat-late').innerText = stats.late;

    const banner = document.getElementById('alert-banner');
    if (stats.late > 0) {
        banner.style.display = 'flex';
        document.getElementById('alert-text').innerText = `${stats.late} aluguel atrasado!`;
    } else {
        banner.style.display = 'none';
    }
}

function renderRecent() {
    const list = document.getElementById('recent-list');
    list.innerHTML = '';
    
    const sorted = [...properties].sort((a, b) => {
        const statusA = getStatus(a.vencimento);
        const statusB = getStatus(b.vencimento);
        if (statusA === 'late' && statusB !== 'late') return -1;
        return 1;
    });

    if (sorted.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 40px; color: #999;">
            <div style="font-size: 50px; margin-bottom: 10px;">🏘️</div>
            <p>Nenhum imóvel cadastrado.</p>
        </div>`;
        return;
    }

    sorted.slice(0, 5).forEach(p => {
        list.innerHTML += createPropertyCard(p);
    });
}

window.renderProperties = function() {
    const list = document.getElementById('full-property-list');
    const search = document.getElementById('search-input').value.toLowerCase();
    list.innerHTML = '';

    const filtered = properties.filter(p => {
        const matchesSearch = p.inquilino.toLowerCase().includes(search) || p.endereco.toLowerCase().includes(search);
        const status = getStatus(p.vencimento);
        const matchesFilter = currentFilter === 'all' || currentFilter === status;
        return matchesSearch && matchesFilter;
    });

    filtered.forEach(p => {
        list.innerHTML += createPropertyCard(p);
    });
};

function createPropertyCard(p) {
    const status = getStatus(p.vencimento);
    const label = getStatusLabel(status, p.vencimento);
    const valorFormato = (p.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    return `
        <div class="property-card" onclick="editProperty('${p.id}')">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <div>
                    <h3 style="font-size: 18px; font-weight: 700; color: #1a1a1a;">${p.inquilino}</h3>
                    <div style="font-size: 13px; color: #666; margin-top: 2px;">📍 ${p.endereco}</div>
                </div>
                <span class="status-badge status-${status}">${label}</span>
            </div>
            <div style="background: #f8f9fa; padding: 12px; border-radius: 12px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; font-size: 14px;">
                    <span style="color: #666;">Valor</span>
                    <span style="font-weight: 700; color: #1a1a1a;">${valorFormato}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 14px; margin-top: 5px;">
                    <span style="color: #666;">Vencimento</span>
                    <span style="font-weight: 700; color: #1a1a1a;">Dia ${p.vencimento}</span>
                </div>
            </div>
            <button class="btn btn-whatsapp" onclick="sendWhatsApp(event, '${p.id}')">
                <span>📲</span> ENVIAR COBRANÇA
            </button>
        </div>
    `;
}

window.renderContracts = function() {
    const list = document.getElementById('contracts-list');
    list.innerHTML = '';
    const withContracts = properties.filter(p => p.hasContract);
    
    if (withContracts.length === 0) {
        list.innerHTML = `<p style="text-align: center; padding: 40px; color: #999;">Nenhum contrato na nuvem.</p>`;
        return;
    }

    withContracts.forEach(p => {
        list.innerHTML += `
            <div class="contract-item" style="background: white; padding: 18px; border-radius: 20px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 10px rgba(0,0,0,0.03);">
                <div>
                    <div style="font-weight: 700;">${p.inquilino}</div>
                    <div style="font-size: 12px; color: #666;">${p.endereco}</div>
                </div>
                <button class="btn" style="background: #e8f9ed; color: var(--primary); padding: 8px 15px; border-radius: 12px; font-size: 14px; font-weight: 700;" onclick="window.open('${p.contratoURL}', '_blank')">VER</button>
            </div>
        `;
    });
};

// Logica de Status (Baseada no dia atual)
function getStatus(day) {
    const today = new Date();
    const currentDay = today.getDate();
    const dueDate = parseInt(day);
    if (currentDay > dueDate) return 'late';
    if (dueDate - currentDay <= 5 && dueDate - currentDay >= 0) return 'near';
    return 'in-day';
}

function getStatusLabel(status, day) {
    const today = new Date();
    const currentDay = today.getDate();
    const diff = currentDay - parseInt(day);
    if (status === 'late') return `Atrasado ${diff} ${diff === 1 ? 'dia' : 'dias'}`;
    if (status === 'near') return (parseInt(day) - currentDay === 0) ? 'Vence Hoje' : 'Vence em breve';
    return 'Em dia';
}

// WhatsApp
window.sendWhatsApp = function(e, id) {
    e.stopPropagation();
    vibrate(20);
    const p = properties.find(prop => prop.id === id);
    const status = getStatus(p.vencimento);
    const today = new Date();
    const currentDay = today.getDate();
    const diff = currentDay - p.vencimento;
    const valorFormato = (p.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    let message = "";
    if (status === 'near') {
        if (diff === 0) message = `Olá *${p.inquilino}*! Passando para lembrar que seu aluguel de *${valorFormato}* vence hoje. Qualquer dúvida estou à disposição! 😊`;
        else message = `Oi *${p.inquilino}*, lembrete amigável: seu aluguel de *${valorFormato}* vence dia *${p.vencimento}*. 🏠`;
    } else if (status === 'late') {
        message = `Olá *${p.inquilino}*, o aluguel de *${valorFormato}* (dia ${p.vencimento}) está com *${diff} dias de atraso*. Consegue verificar para mim? Obrigado!`;
    } else {
        message = `Olá *${p.inquilino}*, tudo bem? Passando para confirmar o recebimento do aluguel. Obrigado! 👍`;
    }

    window.open(`https://wa.me/55${p.telefone}?text=${encodeURIComponent(message)}`, '_blank');
};

// Auth
window.handleLogin = function() {
    const user = document.getElementById('username').value.trim().toLowerCase();
    const pass = document.getElementById('password').value;
    if (user === 'admin' && pass === 'admin') {
        localStorage.setItem('isLoggedIn', 'true');
        vibrate(50);
        checkLogin();
        listenToProperties();
    } else {
        alert('Usuário ou senha incorretos!');
    }
};

window.handleLogout = function() {
    if (confirm('Sair do sistema?')) {
        localStorage.removeItem('isLoggedIn');
        location.reload();
    }
};

function checkLogin() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    document.getElementById('login-screen').style.display = isLoggedIn ? 'none' : 'flex';
    document.getElementById('app-content').classList.toggle('hidden', !isLoggedIn);
}

// Navegação e Modais
window.switchTab = function(tab, el) {
    vibrate(10);
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    renderAll();
};

window.openModal = function(id) {
    document.getElementById(id).style.display = 'flex';
    document.getElementById('property-form').reset();
    document.getElementById('prop-id').value = '';
    document.getElementById('modal-title').innerText = 'Novo Imóvel';
    document.getElementById('delete-btn').classList.add('hidden');
};

window.closeModal = function(id) {
    document.getElementById(id).style.display = 'none';
};

window.editProperty = function(id) {
    const p = properties.find(prop => prop.id === id);
    openModal('property-modal');
    document.getElementById('modal-title').innerText = 'Editar Imóvel';
    document.getElementById('prop-id').value = p.id;
    document.getElementById('prop-name').value = p.inquilino;
    
    let t = p.telefone;
    document.getElementById('prop-phone').value = t.length === 11 ? `(${t.substring(0,2)}) ${t.substring(2,7)}-${t.substring(7)}` : t;
    
    document.getElementById('prop-address').value = p.endereco;
    document.getElementById('prop-value').value = p.valor;
    document.getElementById('prop-due').value = p.vencimento;
    document.getElementById('prop-notes').value = p.observacoes;
    document.getElementById('delete-btn').classList.remove('hidden');
};

function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
}
