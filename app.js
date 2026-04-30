// Configurações Iniciais e Banco de Dados (IndexedDB)
let db;
const DB_NAME = "MachadoDB";
const STORE_NAME = "contracts";

const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve();
        };
        request.onerror = (e) => reject(e);
    });
};

const saveFileToDB = (id, file) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(file, id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject();
    });
};

const getFileFromDB = (id) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject();
    });
};

const deleteFileFromDB = (id) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
};

// Estado Global
let properties = JSON.parse(localStorage.getItem('properties')) || [];
let currentFilter = 'all';

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    await initDB();
    checkLogin();
    if (properties.length === 0) loadDemoData();
    renderAll();
    
    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }
});

// Autenticação
function handleLogin() {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;

    if (user === 'admin' && pass === 'admin') {
        localStorage.setItem('isLoggedIn', 'true');
        checkLogin();
    } else {
        alert('Usuário ou senha incorretos!');
    }
}

function handleLogout() {
    localStorage.removeItem('isLoggedIn');
    checkLogin();
}

function checkLogin() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const loginScreen = document.getElementById('login-screen');
    const appContent = document.getElementById('app-content');

    if (isLoggedIn) {
        loginScreen.classList.add('hidden');
        appContent.classList.remove('hidden');
    } else {
        loginScreen.classList.remove('hidden');
        appContent.classList.add('hidden');
    }
}

// Navegação
function switchTab(tab, el) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    
    if (tab === 'properties') renderProperties();
    if (tab === 'contracts') renderContracts();
}

// Lógica de Imóveis
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

    if (status === 'late') return `Atrasado (${diff} ${diff === 1 ? 'dia' : 'dias'})`;
    if (status === 'near') return diff === 0 ? 'Vence Hoje' : 'Vence em breve';
    return 'Em dia';
}

function saveProperty(e) {
    e.preventDefault();
    const id = document.getElementById('prop-id').value || Date.now().toString();
    const fileInput = document.getElementById('prop-file');
    
    const newProp = {
        id,
        inquilino: document.getElementById('prop-name').value,
        telefone: document.getElementById('prop-phone').value,
        endereco: document.getElementById('prop-address').value,
        valor: parseFloat(document.getElementById('prop-value').value),
        vencimento: parseInt(document.getElementById('prop-due').value),
        observacoes: document.getElementById('prop-notes').value,
        hasContract: !!(fileInput.files[0]) || (properties.find(p => p.id === id)?.hasContract)
    };

    if (fileInput.files[0]) {
        saveFileToDB(id, fileInput.files[0]);
    }

    const index = properties.findIndex(p => p.id === id);
    if (index > -1) properties[index] = newProp;
    else properties.push(newProp);

    localStorage.setItem('properties', JSON.stringify(properties));
    closeModal('property-modal');
    renderAll();
}

function deleteProperty() {
    const id = document.getElementById('prop-id').value;
    if (confirm('Tem certeza que deseja excluir este imóvel?')) {
        properties = properties.filter(p => p.id !== id);
        deleteFileFromDB(id);
        localStorage.setItem('properties', JSON.stringify(properties));
        closeModal('property-modal');
        renderAll();
    }
}

// Renderização
function renderAll() {
    renderStats();
    renderRecent();
}

function renderStats() {
    const stats = properties.reduce((acc, p) => {
        const status = getStatus(p.vencimento);
        acc.total++;
        acc.revenue += p.valor;
        if (status === 'late') acc.late++;
        if (status === 'in-day' || status === 'near') acc.onTime++;
        return acc;
    }, { total: 0, revenue: 0, late: 0, onTime: 0 });

    document.getElementById('stat-total').innerText = stats.total;
    document.getElementById('stat-revenue').innerText = `R$ ${stats.revenue.toLocaleString('pt-BR')}`;
    document.getElementById('stat-on-time').innerText = stats.onTime;
    document.getElementById('stat-late').innerText = stats.late;

    const banner = document.getElementById('alert-banner');
    if (stats.late > 0) {
        banner.style.display = 'flex';
        document.getElementById('alert-text').innerText = `Existem ${stats.late} aluguéis atrasados!`;
    } else {
        banner.style.display = 'none';
    }
}

function renderRecent() {
    const list = document.getElementById('recent-list');
    list.innerHTML = '';
    // Mostra os 3 primeiros
    properties.slice(0, 3).forEach(p => {
        list.innerHTML += createPropertyCard(p);
    });
}

function renderProperties() {
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
}

function createPropertyCard(p) {
    const status = getStatus(p.vencimento);
    const label = getStatusLabel(status, p.vencimento);
    
    return `
        <div class="property-card status-${status}" onclick="editProperty('${p.id}')">
            <div class="property-header">
                <h3>${p.inquilino}</h3>
                <span class="status-badge" style="color: var(--${status === 'in-day' ? 'success' : status === 'near' ? 'warning' : 'danger'})">${label}</span>
            </div>
            <div class="property-info">
                <p>📍 ${p.endereco}</p>
                <p>💰 R$ ${p.valor.toLocaleString('pt-BR')} • Vencimento: dia ${p.vencimento}</p>
            </div>
            <button class="btn btn-whatsapp" onclick="sendWhatsApp(event, '${p.id}')">
                📲 ENVIAR COBRANÇA
            </button>
        </div>
    `;
}

function renderContracts() {
    const list = document.getElementById('contracts-list');
    list.innerHTML = '';
    
    const withContracts = properties.filter(p => p.hasContract);
    
    if (withContracts.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #999;">Nenhum contrato anexado ainda.</p>';
        return;
    }

    withContracts.forEach(p => {
        list.innerHTML += `
            <div class="contract-item">
                <div>
                    <div style="font-weight: bold;">${p.inquilino}</div>
                    <div style="font-size: 12px; color: #666;">${p.endereco}</div>
                </div>
                <button class="btn btn-outline" style="width: auto; padding: 5px 15px;" onclick="viewContract('${p.id}')">Ver</button>
            </div>
        `;
    });
}

// WhatsApp Logic
function sendWhatsApp(e, id) {
    e.stopPropagation();
    const p = properties.find(prop => prop.id === id);
    const status = getStatus(p.vencimento);
    const today = new Date();
    const currentDay = today.getDate();
    const diff = currentDay - p.vencimento;

    let message = "";
    
    if (status === 'near') {
        if (diff === 0) message = `Olá ${p.inquilino}! Passando para lembrar que seu aluguel de R$ ${p.valor} vence hoje. Qualquer dúvida estou à disposição!`;
        else if (p.vencimento - currentDay === 1) message = `Oi ${p.inquilino}, tudo bem? Lembrete amigável: seu aluguel vence amanhã, dia ${p.vencimento}.`;
        else message = `Olá ${p.inquilino}! Tudo bem? Passando para lembrar que o aluguel de R$ ${p.valor} vence em alguns dias (dia ${p.vencimento}).`;
    } else if (status === 'late') {
        if (diff <= 7) message = `Olá ${p.inquilino}, notei que o aluguel com vencimento no dia ${p.vencimento} ainda não foi confirmado. Ele está com ${diff} dias de atraso. Consegue verificar para mim?`;
        else message = `Olá ${p.inquilino}, precisamos conversar sobre o aluguel que venceu no dia ${p.vencimento}. Já são ${diff} dias de atraso. Aguardo seu retorno.`;
    } else {
        message = `Olá ${p.inquilino}, tudo bem? Passando para desejar um ótimo mês e confirmar que recebemos seu aluguel. Obrigado!`;
    }

    const url = `https://wa.me/55${p.telefone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

// Modais
function openModal(id) {
    document.getElementById(id).style.display = 'flex';
    document.getElementById('property-form').reset();
    document.getElementById('prop-id').value = '';
    document.getElementById('modal-title').innerText = 'Novo Imóvel';
    document.getElementById('delete-btn').classList.add('hidden');
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function editProperty(id) {
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
}

async function viewContract(id) {
    const file = await getFileFromDB(id);
    if (file) {
        const url = URL.createObjectURL(file);
        window.open(url, '_blank');
    } else {
        alert('Contrato não encontrado!');
    }
}

function filterStatus(status, el) {
    currentFilter = status;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    renderProperties();
}

// Dados de Exemplo
function loadDemoData() {
    const today = new Date();
    const currentDay = today.getDate();
    
    properties = [
        {
            id: "1",
            inquilino: "José da Silva",
            telefone: "11999998888",
            endereco: "Rua das Flores, 123",
            valor: 1200.00,
            vencimento: currentDay - 3 > 0 ? currentDay - 3 : 1, // Atrasado
            observacoes: "Inquilino antigo, sempre paga em dia normalmente.",
            hasContract: false
        },
        {
            id: "2",
            inquilino: "Maria Oliveira",
            telefone: "11988887777",
            endereco: "Av. Central, 500 - Ap 42",
            valor: 1550.00,
            vencimento: currentDay + 2 <= 31 ? currentDay + 2 : 28, // Vencendo logo
            observacoes: "",
            hasContract: false
        },
        {
            id: "3",
            inquilino: "Carlos Souza",
            telefone: "11977776666",
            endereco: "Rua do Bosque, 45",
            valor: 900.00,
            vencimento: currentDay - 10 > 0 ? currentDay - 10 : 5, // Muito atrasado
            observacoes: "",
            hasContract: false
        }
    ];
    localStorage.setItem('properties', JSON.stringify(properties));
}
