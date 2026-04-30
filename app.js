// Configurações Iniciais e Banco de Dados (IndexedDB)
let db;
const DB_NAME = "MachadoDB";
const STORE_NAME = "contracts";

const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            if (!e.target.result.objectStoreNames.contains(STORE_NAME)) {
                e.target.result.createObjectStore(STORE_NAME);
            }
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
    setupMasks();
    renderAll();
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }
});

// Máscaras de Input (Facilita para idosos)
function setupMasks() {
    const phoneInput = document.getElementById('prop-phone');
    phoneInput.addEventListener('input', (e) => {
        let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
        e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
    });

    const valueInput = document.getElementById('prop-value');
    valueInput.addEventListener('blur', (e) => {
        if (e.target.value) {
            let val = parseFloat(e.target.value);
            e.target.setAttribute('data-val', val);
        }
    });
}

// Autenticação
function handleLogin() {
    const user = document.getElementById('username').value.trim().toLowerCase();
    const pass = document.getElementById('password').value;

    if (user === 'admin' && pass === 'admin') {
        localStorage.setItem('isLoggedIn', 'true');
        vibrate(50);
        checkLogin();
    } else {
        alert('Usuário ou senha incorretos!');
    }
}

function handleLogout() {
    if (confirm('Deseja realmente sair?')) {
        localStorage.removeItem('isLoggedIn');
        checkLogin();
    }
}

function checkLogin() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const loginScreen = document.getElementById('login-screen');
    const appContent = document.getElementById('app-content');

    if (isLoggedIn) {
        loginScreen.style.display = 'none';
        appContent.classList.remove('hidden');
    } else {
        loginScreen.style.display = 'flex';
        appContent.classList.add('hidden');
    }
}

// Navegação
function switchTab(tab, el) {
    vibrate(10);
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

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

    if (status === 'late') return `Atrasado ${diff} ${diff === 1 ? 'dia' : 'dias'}`;
    if (status === 'near') return (parseInt(day) - currentDay === 0) ? 'Vence Hoje' : 'Vence em breve';
    return 'Em dia';
}

function saveProperty(e) {
    e.preventDefault();
    const id = document.getElementById('prop-id').value || Date.now().toString();
    const fileInput = document.getElementById('prop-file');
    
    const rawPhone = document.getElementById('prop-phone').value.replace(/\D/g, '');
    
    const newProp = {
        id,
        inquilino: document.getElementById('prop-name').value,
        telefone: rawPhone,
        endereco: document.getElementById('prop-address').value,
        valor: parseFloat(document.getElementById('prop-value').value),
        vencimento: parseInt(document.getElementById('prop-due').value),
        observacoes: document.getElementById('prop-notes').value,
        hasContract: !!(fileInput.files[0]) || (properties.find(p => p.id === id)?.hasContract || false)
    };

    if (fileInput.files[0]) {
        saveFileToDB(id, fileInput.files[0]);
    }

    const index = properties.findIndex(p => p.id === id);
    if (index > -1) properties[index] = newProp;
    else properties.push(newProp);

    localStorage.setItem('properties', JSON.stringify(properties));
    vibrate(30);
    closeModal('property-modal');
    renderAll();
}

function deleteProperty() {
    const id = document.getElementById('prop-id').value;
    if (confirm('Tem certeza que deseja excluir este imóvel? Todos os dados e o contrato serão apagados permanentemente.')) {
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
    
    // Ordena por status (atrasados primeiro)
    const sorted = [...properties].sort((a, b) => {
        const statusA = getStatus(a.vencimento);
        const statusB = getStatus(b.vencimento);
        if (statusA === 'late' && statusB !== 'late') return -1;
        if (statusA !== 'late' && statusB === 'late') return 1;
        return 0;
    });

    if (sorted.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 40px; color: #999;">
            <div style="font-size: 50px; margin-bottom: 10px;">🏘️</div>
            <p>Nenhum imóvel cadastrado.<br>Toque no + para começar.</p>
        </div>`;
        return;
    }

    sorted.slice(0, 5).forEach(p => {
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

    if (filtered.length === 0) {
        list.innerHTML = `<p style="text-align: center; padding: 40px; color: #999;">Nenhum imóvel encontrado.</p>`;
        return;
    }

    filtered.forEach(p => {
        list.innerHTML += createPropertyCard(p);
    });
}

function createPropertyCard(p) {
    const status = getStatus(p.vencimento);
    const label = getStatusLabel(status, p.vencimento);
    const valorFormato = p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
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
                    <span style="color: #666;">Valor Mensal</span>
                    <span style="font-weight: 700; color: #1a1a1a;">${valorFormato}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 14px; margin-top: 5px;">
                    <span style="color: #666;">Vencimento</span>
                    <span style="font-weight: 700; color: #1a1a1a;">Todo dia ${p.vencimento}</span>
                </div>
            </div>
            <button class="btn btn-whatsapp" onclick="sendWhatsApp(event, '${p.id}')">
                <span>📲</span> ENVIAR COBRANÇA
            </button>
        </div>
    `;
}

function renderContracts() {
    const list = document.getElementById('contracts-list');
    list.innerHTML = '';
    
    const withContracts = properties.filter(p => p.hasContract);
    
    if (withContracts.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 40px; color: #999;">
            <div style="font-size: 50px; margin-bottom: 10px;">📄</div>
            <p>Nenhum contrato anexado.</p>
        </div>`;
        return;
    }

    withContracts.forEach(p => {
        list.innerHTML += `
            <div class="contract-item" style="background: white; padding: 18px; border-radius: 20px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 10px rgba(0,0,0,0.03);">
                <div>
                    <div style="font-weight: 700; color: #1a1a1a;">${p.inquilino}</div>
                    <div style="font-size: 12px; color: #666;">Contrato de Aluguel</div>
                </div>
                <button class="btn" style="background: #e8f9ed; color: var(--primary); padding: 8px 20px; border-radius: 12px; font-size: 14px; font-weight: 700;" onclick="viewContract('${p.id}')">ABRIR</button>
            </div>
        `;
    });
}

// WhatsApp Logic
function sendWhatsApp(e, id) {
    e.stopPropagation();
    vibrate(20);
    const p = properties.find(prop => prop.id === id);
    const status = getStatus(p.vencimento);
    const today = new Date();
    const currentDay = today.getDate();
    const diff = currentDay - p.vencimento;
    const valorFormato = p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    let message = "";
    
    if (status === 'near') {
        if (diff === 0) message = `Olá *${p.inquilino}*! Passando para lembrar que seu aluguel de *${valorFormato}* vence hoje. Qualquer dúvida estou à disposição! 😊`;
        else if (p.vencimento - currentDay === 1) message = `Oi *${p.inquilino}*, tudo bem? Lembrete amigável: seu aluguel vence amanhã, dia *${p.vencimento}*. 🏠`;
        else message = `Olá *${p.inquilino}*! Tudo bem? Passando para lembrar que o aluguel de *${valorFormato}* vence em alguns dias (dia *${p.vencimento}*).`;
    } else if (status === 'late') {
        if (diff <= 7) message = `Olá *${p.inquilino}*, tudo bem? Notei que o aluguel de *${valorFormato}* (vencimento dia ${p.vencimento}) ainda não consta como pago. Ele está com *${diff} dias de atraso*. Consegue verificar para mim? Obrigado!`;
        else message = `Olá *${p.inquilino}*, precisamos conversar sobre o aluguel que venceu no dia ${p.vencimento}. Já temos *${diff} dias de atraso*. Por favor, me dê um retorno o quanto antes.`;
    } else {
        message = `Olá *${p.inquilino}*, tudo bem? Passando para desejar um ótimo mês e confirmar o recebimento do aluguel. Obrigado! 👍`;
    }

    const url = `https://wa.me/55${p.telefone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

// Utilitários
function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
}

function openModal(id) {
    document.getElementById(id).style.display = 'flex';
    document.getElementById('property-form').reset();
    document.getElementById('prop-id').value = '';
    document.getElementById('modal-title').innerText = 'Novo Imóvel';
    document.getElementById('delete-btn').classList.add('hidden');
    document.body.style.overflow = 'hidden'; // Trava scroll do fundo
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    document.body.style.overflow = 'auto';
}

function editProperty(id) {
    const p = properties.find(prop => prop.id === id);
    openModal('property-modal');
    document.getElementById('modal-title').innerText = 'Editar Imóvel';
    document.getElementById('prop-id').value = p.id;
    document.getElementById('prop-name').value = p.inquilino;
    
    // Formata telefone para o campo
    let t = p.telefone;
    if (t.length === 11) {
        document.getElementById('prop-phone').value = `(${t.substring(0,2)}) ${t.substring(2,7)}-${t.substring(7)}`;
    } else {
        document.getElementById('prop-phone').value = t;
    }
    
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
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    renderProperties();
}

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
            vencimento: currentDay - 3 > 0 ? currentDay - 3 : 25,
            observacoes: "Inquilino antigo.",
            hasContract: false
        }
    ];
    localStorage.setItem('properties', JSON.stringify(properties));
}
