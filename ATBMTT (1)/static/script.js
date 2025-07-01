// Modern Professional JavaScript for Cloud Storage Application

// Global variables
let selectedFile = null;
let currentStep = 0;
let isProcessing = false;

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('vi-VN');
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} fade-in`;
    notification.innerHTML = `
        <i class="fas fa-${getNotificationIcon(type)} me-2"></i>
        ${message}
        <button type="button" class="btn-close ms-auto" onclick="this.parentElement.remove()"></button>
    `;
    
    // Add to page
    const container = document.querySelector('.main-container .p-4') || document.body;
    container.insertBefore(notification, container.firstChild);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function getNotificationIcon(type) {
    const icons = {
        'info': 'info-circle',
        'success': 'check-circle',
        'warning': 'exclamation-triangle',
        'danger': 'times-circle'
    };
    return icons[type] || 'info-circle';
}

function addLog(containerId, message, type = 'info') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type} slide-in`;
    logEntry.innerHTML = `<strong>[${timestamp}]</strong> ${message}`;
    container.appendChild(logEntry);
    container.scrollTop = container.scrollHeight;
}

function updateButtonState(buttonId, enabled, text = null, icon = null) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    button.disabled = !enabled;
    if (text) {
        const iconElement = button.querySelector('i');
        const textElement = button.querySelector('span') || button;
        
        if (icon && iconElement) {
            iconElement.className = `fas fa-${icon}`;
        }
        
        if (textElement.tagName === 'SPAN') {
            textElement.textContent = text;
        } else {
            button.innerHTML = `<i class="fas fa-${icon || 'arrow-right'}"></i> ${text}`;
        }
    }
}

function showLoading(buttonId) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    button.innerHTML = '<div class="spinner me-2"></div> Đang xử lý...';
    button.disabled = true;
}

function hideLoading(buttonId, originalText, originalIcon) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    button.innerHTML = `<i class="fas fa-${originalIcon}"></i> ${originalText}`;
    button.disabled = false;
}

// File handling functions
function updateFileName() {
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');

    if (fileInput && fileInput.files.length > 0) {
        selectedFile = fileInput.files[0];
        
        if (fileName) fileName.textContent = selectedFile.name;
        if (fileSize) fileSize.textContent = formatFileSize(selectedFile.size);
        if (fileInfo) fileInfo.style.display = 'block';
        
        // Validate file type
        const allowedTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv'];
        if (!allowedTypes.includes(selectedFile.type)) {
            showNotification('Chỉ hỗ trợ file video (MP4, AVI, MOV, WMV)', 'warning');
        }
    } else {
        if (fileInfo) fileInfo.style.display = 'none';
        selectedFile = null;
    }
}

// API functions
async function performHandshake() {
    if (isProcessing) return;
    isProcessing = true;
    
    const btn = document.getElementById('handshakeBtn');
    const log = document.getElementById('handshakeLog');
    const originalText = 'Bắt đầu Handshake';
    const originalIcon = 'handshake';
    
    showLoading('handshakeBtn');
    if (log) log.style.display = 'block';
    addLog('handshakeLog', '🔄 Bắt đầu handshake với Google Cloud Storage...', 'info');
    
    try {
        const response = await fetch('/handshake', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            addLog('handshakeLog', '✅ Handshake thành công! Cloud đã sẵn sàng nhận file.', 'success');
            addLog('handshakeLog', '📡 Kết nối socket TCP đã thiết lập', 'info');
            updateButtonState('authBtn', true);
            currentStep = 1;
            showNotification('Handshake thành công!', 'success');
        } else {
            addLog('handshakeLog', `❌ Handshake thất bại: ${data.error}`, 'error');
            showNotification('Handshake thất bại!', 'danger');
        }
    } catch (error) {
        addLog('handshakeLog', `❌ Lỗi kết nối: ${error.message}`, 'error');
        showNotification('Lỗi kết nối mạng!', 'danger');
    }
    
    hideLoading('handshakeBtn', originalText, originalIcon);
    isProcessing = false;
}

async function performAuth() {
    if (isProcessing) return;
    isProcessing = true;
    
    const btn = document.getElementById('authBtn');
    const log = document.getElementById('authLog');
    const originalText = 'Xác thực & Trao khóa';
    const originalIcon = 'key';
    
    showLoading('authBtn');
    if (log) log.style.display = 'block';
    addLog('authLog', '🔐 Bắt đầu xác thực và trao đổi khóa...', 'info');
    
    try {
        const response = await fetch('/auth_key_exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            addLog('authLog', '✅ Xác thực RSA/SHA-512 thành công!', 'success');
            addLog('authLog', '✅ Trao đổi khóa AES thành công!', 'success');
            addLog('authLog', `🔑 Session Key: ${data.session_key.substring(0, 20)}...`, 'info');
            addLog('authLog', '🔒 Kênh truyền đã được mã hóa', 'info');
            updateButtonState('uploadBtn', true);
            currentStep = 2;
            showNotification('Xác thực thành công!', 'success');
        } else {
            addLog('authLog', `❌ Xác thực thất bại: ${data.error}`, 'error');
            showNotification('Xác thực thất bại!', 'danger');
        }
    } catch (error) {
        addLog('authLog', `❌ Lỗi xác thực: ${error.message}`, 'error');
        showNotification('Lỗi xác thực!', 'danger');
    }
    
    hideLoading('authBtn', originalText, originalIcon);
    isProcessing = false;
}

async function uploadFile() {
    if (!selectedFile) {
        showNotification('Vui lòng chọn file trước khi upload!', 'warning');
        return;
    }
    
    if (isProcessing) return;
    isProcessing = true;
    
    const btn = document.getElementById('uploadBtn');
    const log = document.getElementById('uploadLog');
    const originalText = 'Upload file';
    const originalIcon = 'cloud-upload-alt';
    
    showLoading('uploadBtn');
    if (log) log.style.display = 'block';
    addLog('uploadLog', '📤 Bắt đầu upload file với mã hóa AES-CBC...', 'info');
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    
    try {
        const response = await fetch('/upload_file', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            addLog('uploadLog', '✅ Upload thành công!', 'success');
            addLog('uploadLog', `📁 File: ${data.filename}`, 'info');
            addLog('uploadLog', `🔐 Mã hóa: AES-CBC với IV ngẫu nhiên`, 'info');
            addLog('uploadLog', `📊 Kích thước: ${formatFileSize(data.file_size)}`, 'info');
            addLog('uploadLog', `🔄 Retry: ${data.retry_count} lần`, 'info');
            addLog('uploadLog', `⏱️ Thời gian: ${data.upload_time}ms`, 'info');
            currentStep = 3;
            showNotification('Upload thành công!', 'success');
        } else {
            addLog('uploadLog', `❌ Upload thất bại: ${data.error}`, 'error');
            showNotification('Upload thất bại!', 'danger');
        }
    } catch (error) {
        addLog('uploadLog', `❌ Lỗi upload: ${error.message}`, 'error');
        showNotification('Lỗi upload!', 'danger');
    }
    
    hideLoading('uploadBtn', originalText, originalIcon);
    isProcessing = false;
}

// Cloud functions
async function refreshFileList() {
    const refreshBtn = document.querySelector('[onclick="refreshFileList()"]');
    if (refreshBtn) {
        const originalText = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<div class="spinner me-2"></div> Đang tải...';
        refreshBtn.disabled = true;
        
        try {
            const response = await fetch('/list_files');
            const data = await response.json();
            
            if (data.success) {
                fileList = data.files;
                renderFileList();
                showNotification('Danh sách file đã được cập nhật!', 'success');
            } else {
                console.error('Lỗi khi tải danh sách file:', data.error);
                showNotification('Lỗi khi tải danh sách file!', 'danger');
            }
        } catch (error) {
            console.error('Lỗi kết nối:', error);
            showNotification('Lỗi kết nối!', 'danger');
        }
        
        refreshBtn.innerHTML = originalText;
        refreshBtn.disabled = false;
    }
}

function renderFileList() {
    const fileListContainer = document.getElementById('fileList');
    const fileSelect = document.getElementById('fileSelect');
    
    if (!fileListContainer) return;
    
    if (fileList.length === 0) {
        fileListContainer.innerHTML = `
            <div class="text-center text-muted py-4 fade-in">
                <i class="fas fa-folder-open fa-3x mb-3"></i>
                <p>Chưa có file nào được upload</p>
            </div>
        `;
        if (fileSelect) {
            fileSelect.innerHTML = '<option value="">Chọn file để download...</option>';
        }
        return;
    }
    
    // Render file list
    fileListContainer.innerHTML = fileList.map((file, index) => `
        <div class="file-card fade-in" style="animation-delay: ${index * 0.1}s">
            <div class="d-flex align-items-center">
                <div class="file-icon">
                    <i class="fas fa-file-video"></i>
                </div>
                <div class="flex-grow-1">
                    <h5 class="mb-1">${file.filename}</h5>
                    <p class="text-muted mb-1">
                        <i class="fas fa-calendar me-1"></i>
                        Upload: ${formatDate(file.upload_time)}
                    </p>
                    <p class="text-muted mb-0">
                        <i class="fas fa-hdd me-1"></i>
                        Kích thước: ${formatFileSize(file.size)}
                    </p>
                </div>
                <button class="btn btn-success" onclick="downloadSpecificFile('${file.filename}')">
                    <i class="fas fa-download"></i>
                    Download
                </button>
            </div>
        </div>
    `).join('');
    
    // Update file select
    if (fileSelect) {
        fileSelect.innerHTML = '<option value="">Chọn file để download...</option>' + 
            fileList.map(file => `<option value="${file.filename}">${file.filename}</option>`).join('');
    }
    
    updateStats();
}

function updateStats() {
    const totalFiles = fileList.length;
    const totalSize = fileList.reduce((sum, file) => sum + file.size, 0);
    
    const totalFilesElement = document.getElementById('totalFiles');
    const totalSizeElement = document.getElementById('totalSize');
    
    if (totalFilesElement) totalFilesElement.textContent = totalFiles;
    if (totalSizeElement) totalSizeElement.textContent = formatFileSize(totalSize);
}

async function downloadSpecificFile(filename) {
    if (isProcessing) return;
    isProcessing = true;
    
    const btn = document.getElementById('downloadBtn');
    const log = document.getElementById('downloadLog');
    
    if (btn) btn.disabled = true;
    if (log) log.style.display = 'block';
    addLog('downloadLog', `📥 Bắt đầu download file: ${filename}`, 'info');
    
    try {
        const response = await fetch('/download_file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: filename })
        });
        
        const data = await response.json();
        
        if (data.success) {
            addLog('downloadLog', '✅ Xác thực người dùng thành công!', 'success');
            addLog('downloadLog', '✅ Kiểm tra toàn vẹn file thành công!', 'success');
            addLog('downloadLog', '✅ Giải mã AES-CBC thành công!', 'success');
            addLog('downloadLog', `📁 File: ${data.filename}`, 'info');
            addLog('downloadLog', `📊 Kích thước: ${formatFileSize(data.file_size)}`, 'info');
            addLog('downloadLog', '🔗 Tạo link download...', 'info');
            
            // Create download link
            const link = document.createElement('a');
            link.href = data.download_url;
            link.download = data.filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            addLog('downloadLog', '✅ Download hoàn tất! File đã được tải về máy.', 'success');
            
            // Update download count
            const downloadCount = document.getElementById('downloadCount');
            if (downloadCount) {
                downloadCount.textContent = parseInt(downloadCount.textContent) + 1;
            }
            
            showNotification('Download thành công!', 'success');
        } else {
            addLog('downloadLog', `❌ Download thất bại: ${data.error}`, 'error');
            showNotification('Download thất bại!', 'danger');
        }
    } catch (error) {
        addLog('downloadLog', `❌ Lỗi download: ${error.message}`, 'error');
        showNotification('Lỗi download!', 'danger');
    }
    
    if (btn) btn.disabled = false;
    isProcessing = false;
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Initialize file input listener
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', updateFileName);
    }
    
    // Initialize file select listener
    const fileSelect = document.getElementById('fileSelect');
    if (fileSelect) {
        fileSelect.addEventListener('change', function() {
            const downloadBtn = document.getElementById('downloadBtn');
            if (downloadBtn) {
                downloadBtn.disabled = !this.value;
            }
        });
    }
    
    // Load file list for cloud page
    if (window.location.pathname === '/cloud') {
        refreshFileList();
    }
    
    // Add smooth scrolling to log containers
    const logContainers = document.querySelectorAll('.log-container');
    logContainers.forEach(container => {
        container.style.scrollBehavior = 'smooth';
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + Enter to submit forms
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.tagName === 'BUTTON' && !activeElement.disabled) {
            activeElement.click();
        }
    }
    
    // Escape to close notifications
    if (e.key === 'Escape') {
        const notifications = document.querySelectorAll('.alert');
        notifications.forEach(notification => notification.remove());
    }
}); 