from flask import Flask, render_template, request, jsonify, send_from_directory
import os
from Crypto.Cipher import AES, PKCS1_OAEP
from Crypto.PublicKey import RSA
from Crypto.Random import get_random_bytes
from Crypto.Hash import SHA512
from Crypto.Signature import pkcs1_15
import base64
import time
import json

app = Flask(__name__)
UPLOAD_FOLDER = 'static/cloud_storage'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Sinh cặp khóa RSA cho cloud và client
CLOUD_RSA_KEY = RSA.generate(2048)
CLOUD_PUBLIC_KEY = CLOUD_RSA_KEY.publickey()
CLIENT_RSA_KEY = RSA.generate(2048)
CLIENT_PUBLIC_KEY = CLIENT_RSA_KEY.publickey()

# Lưu trữ session keys và metadata
sessions = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/client')
def client():
    return render_template('client.html')

@app.route('/cloud')
def cloud():
    return render_template('cloud.html')

# Mô phỏng socket TCP
def socket_send(data):
    # Giả lập gửi qua socket, có thể mất gói hoặc timeout
    time.sleep(0.1)  # Giả lập độ trễ mạng
    
    # Thêm 30% xác suất lỗi mạng
    if get_random_bytes(1)[0] < 77:  # 30% lỗi
        return False
    return True

def socket_receive():
    # Giả lập nhận qua socket
    time.sleep(0.1)
    
    # Thêm 20% xác suất lỗi mạng
    if get_random_bytes(1)[0] < 51:  # 20% lỗi
        return False
    return True

# Handshake
@app.route('/handshake', methods=['POST'])
def handshake():
    log = []
    log.append('[Socket] Client gửi "Hello!" qua socket đến Cloud')
    
    # Retry handshake tối đa 3 lần
    MAX_HANDSHAKE_RETRY = 3
    for attempt in range(MAX_HANDSHAKE_RETRY):
        log.append(f'[Handshake] Lần thử {attempt + 1}/{MAX_HANDSHAKE_RETRY}')
        
        if socket_send("Hello!"):
            log.append('[Socket] Cloud nhận "Hello!"')
            log.append('[Socket] Cloud trả lời "Ready!" qua socket')
            if socket_receive():
                log.append('[Socket] Client nhận "Ready!"')
                log.append('[Handshake] Handshake thành công!')
                return jsonify({'success': True, 'log': log})
            else:
                log.append('[Socket] Lỗi: Không nhận được "Ready!" từ Cloud')
        else:
            log.append('[Socket] Lỗi: Không gửi được "Hello!" đến Cloud')
        
        if attempt < MAX_HANDSHAKE_RETRY - 1:
            log.append(f'[Handshake] Chờ 2 giây và thử lại...')
            time.sleep(0.1)  # Giả lập delay
    
    log.append('[Handshake] Handshake thất bại sau 3 lần thử')
    return jsonify({'success': False, 'error': 'Handshake failed after 3 attempts', 'log': log})

# Xác thực & Trao khóa
@app.route('/auth_key_exchange', methods=['POST'])
def auth_key_exchange():
    log = []
    
    # Tạo session_id tự động nếu không có
    session_id = request.form.get('session_id') or f"session_{int(time.time())}"
    filename = request.form.get('filename', 'unknown_file')
    filesize = request.form.get('filesize', '0')
    timestamp = str(int(time.time()))
    
    # Client ký metadata
    metadata = f"{filename}:{filesize}:{timestamp}"
    metadata_hash = SHA512.new(metadata.encode())
    client_signature = pkcs1_15.new(CLIENT_RSA_KEY).sign(metadata_hash)
    
    log.append(f'[Auth] Client ký metadata: {metadata}')
    log.append(f'[Auth] Client gửi metadata và chữ ký qua socket')
    
    # Client sinh session key và mã hóa bằng RSA
    session_key = get_random_bytes(32)
    cipher_rsa = PKCS1_OAEP.new(CLOUD_PUBLIC_KEY)
    encrypted_session_key = cipher_rsa.encrypt(session_key)
    
    log.append('[Key] Client sinh session key AES-256')
    log.append('[Key] Client mã hóa session key bằng RSA-2048 (PKCS#1 v1.5)')
    log.append('[Key] Client gửi encrypted session key qua socket')
    
    # Lưu session
    sessions[session_id] = {
        'session_key': session_key,
        'filename': filename,
        'metadata': metadata,
        'client_signature': client_signature
    }
    
    log.append(f'[Session] Tạo session: {session_id}')
    return jsonify({'success': True, 'session_key': session_key.hex()[:20] + '...', 'log': log})

# Upload file
@app.route('/upload_file', methods=['POST'])
def upload_file():
    log = []
    
    # Tạo session_id tự động nếu không có
    session_id = request.form.get('session_id') or f"session_{int(time.time())}"
    
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file uploaded', 'log': log}), 400
    
    file = request.files['file']
    filename = file.filename
    file_bytes = file.read()
    
    # Tạo session mới nếu chưa có
    if session_id not in sessions:
        log.append('[Session] Tạo session mới cho upload')
        session_key = get_random_bytes(32)
        sessions[session_id] = {
            'session_key': session_key,
            'filename': filename,
            'metadata': f"{filename}:{len(file_bytes)}:{int(time.time())}",
            'client_signature': b''
        }
    else:
        session = sessions[session_id]
        session_key = session['session_key']
    
    # Mã hóa file
    log.append('[Encrypt] Tạo IV ngẫu nhiên')
    iv = get_random_bytes(16)
    cipher = AES.new(session_key, AES.MODE_CBC, iv)
    
    # Padding PKCS7
    pad_len = 16 - len(file_bytes) % 16
    file_bytes += bytes([pad_len]) * pad_len
    ciphertext = cipher.encrypt(file_bytes)
    
    log.append('[Encrypt] Mã hóa file bằng AES-CBC')
    
    # Tính hash và ký
    data_to_hash = iv + ciphertext
    file_hash = SHA512.new(data_to_hash).digest()
    cloud_signature = pkcs1_15.new(CLOUD_RSA_KEY).sign(SHA512.new(data_to_hash))
    
    log.append('[Integrity] Tính hash SHA-512(IV || ciphertext)')
    log.append('[Sign] Cloud ký hash bằng RSA-2048/SHA-512')
    
    # Tạo gói tin
    packet = {
        "iv": base64.b64encode(iv).decode(),
        "cipher": base64.b64encode(ciphertext).decode(),
        "hash": file_hash.hex(),
        "sig": base64.b64encode(cloud_signature).decode()
    }
    
    log.append('[Packet] Tạo gói tin JSON với IV, cipher, hash, signature')
    
    # Mô phỏng upload từng gói với retry
    MAX_RETRY = 3
    TIMEOUT = 5  # 5 giây
    retry_count = 0
    
    for attempt in range(MAX_RETRY):
        log.append(f'[Upload] Gửi gói tin (lần {attempt + 1})')
        
        # Mô phỏng lỗi mạng - TĂNG TỶ LỆ LỖI LÊN 80%!
        if get_random_bytes(1)[0] < 204:  # 80% mất gói
            log.append(f'[Network] Lỗi mất gói tin (lần {attempt + 1})')
            retry_count += 1
            if attempt < MAX_RETRY - 1:
                log.append(f'[Retry] Chờ {TIMEOUT} giây và gửi lại...')
                time.sleep(0.1)  # Giả lập timeout
                continue
            else:
                log.append('[Error] Gửi thất bại sau 3 lần retry')
                return jsonify({'success': False, 'error': 'Upload failed after 3 retries',
                                 'retry_count': retry_count, 'log': log}), 500
        
        # Mô phỏng timeout - TĂNG TỶ LỆ LỖI LÊN 50%!
        if get_random_bytes(1)[0] < 128:  # 50% timeout
            log.append(f'[Network] Timeout không nhận ACK trong {TIMEOUT} giây (lần {attempt + 1})')
            retry_count += 1
            if attempt < MAX_RETRY - 1:
                log.append(f'[Retry] Chờ {TIMEOUT} giây và gửi lại...')
                time.sleep(0.1)
                continue
            else:
                log.append('[Error] Timeout sau 3 lần retry')
                return jsonify({'success': False, 'error': 'Timeout after 3 retries', 'retry_count': retry_count, 'log': log}), 500
        
        # Thành công
        log.append('[Network] Gói tin đến Cloud thành công')
        log.append('[Cloud] Cloud nhận gói tin, kiểm tra hash và chữ ký')
        
        # Cloud kiểm tra
        try:
            received_iv = base64.b64decode(packet["iv"])
            received_cipher = base64.b64decode(packet["cipher"])
            received_hash = bytes.fromhex(packet["hash"])
            received_sig = base64.b64decode(packet["sig"])
            
            # Kiểm tra hash
            calc_hash = SHA512.new(received_iv + received_cipher).digest()
            if calc_hash != received_hash:
                log.append('[Cloud] Hash không khớp, gửi NACK (lỗi integrity)')
                return jsonify({'success': False, 'error': 'Hash mismatch', 'retry_count': retry_count, 'log': log}), 400
            
            # Kiểm tra chữ ký
            try:
                pkcs1_15.new(CLOUD_PUBLIC_KEY).verify(SHA512.new(received_iv + received_cipher), received_sig)
                log.append('[Cloud] Chữ ký hợp lệ')
            except:
                log.append('[Cloud] Chữ ký không hợp lệ, gửi NACK (lỗi auth)')
                return jsonify({'success': False, 'error': 'Invalid signature', 'retry_count': retry_count, 'log': log}), 400
            
            # Giải mã và lưu file
            cipher = AES.new(session_key, AES.MODE_CBC, received_iv)
            decrypted = cipher.decrypt(received_cipher)
            pad_len = decrypted[-1]
            original_file = decrypted[:-pad_len]
            
            save_path = os.path.join(UPLOAD_FOLDER, filename)
            with open(save_path, 'wb') as f:
                f.write(original_file)
            
            log.append('[Cloud] Giải mã thành công bằng AES-CBC')
            log.append(f'[Cloud] Lưu file {filename} trên cloud')
            log.append('[Cloud] Gửi ACK qua socket tới Client')
            log.append('[Upload] Upload thành công!')
            
            return jsonify({
                'success': True, 
                'filename': filename, 
                'file_size': len(original_file),
                'retry_count': retry_count,
                'upload_time': int((time.time() - float(session_id.split('_')[1])) * 1000) if '_' in session_id else 0,
                'log': log
            })
            
        except Exception as e:
            log.append(f'[Cloud] Lỗi xử lý: {str(e)}')
            return jsonify({'success': False, 'error': 'Processing error', 'retry_count': retry_count, 'log': log}), 500

# Download file
@app.route('/download_file', methods=['POST'])
def download_file():
    log = []
    filename = request.form.get('filename')
    
    if not filename:
        return jsonify({'success': False, 'error': 'No filename provided', 'log': log}), 400
    
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    if not os.path.exists(file_path):
        log.append('[Error] File không tồn tại trên cloud')
        return jsonify({'success': False, 'error': 'File not found', 'log': log}), 404
    
    log.append(f'[Download] Client gửi yêu cầu download {filename}')
    
    # Client ký yêu cầu download
    download_request = f"download:{filename}:{int(time.time())}"
    request_hash = SHA512.new(download_request.encode())
    client_signature = pkcs1_15.new(CLIENT_RSA_KEY).sign(request_hash)
    
    log.append('[Auth] Client ký yêu cầu download bằng RSA/SHA-512')
    log.append('[Auth] Client gửi yêu cầu và chữ ký qua socket')
    
    # Cloud kiểm tra chữ ký
    try:
        pkcs1_15.new(CLIENT_PUBLIC_KEY).verify(request_hash, client_signature)
        log.append('[Cloud] Xác thực chữ ký Client hợp lệ')
    except:
        log.append('[Cloud] Chữ ký Client không hợp lệ, gửi NACK (lỗi auth)')
        return jsonify({'success': False, 'error': 'Invalid client signature', 'log': log}), 400
    
    # Cloud đọc file
    with open(file_path, 'rb') as f:
        file_bytes = f.read()
    
    log.append('[Cloud] Đọc file thành công')
    log.append('[Cloud] Gửi file qua socket')
    
    # Client nhận file
    log.append('[Client] Nhận file từ Cloud')
    log.append('[Client] Gửi ACK qua socket tới Cloud')
    log.append('[Download] Download thành công!')
    
    # Tạo download URL
    download_url = f'/download/{filename}'
    
    return jsonify({
        'success': True, 
        'filename': filename,
        'file_size': len(file_bytes),
        'download_url': download_url,
        'log': log
    })

# Lấy danh sách file
@app.route('/list_files', methods=['GET'])
def list_files():
    files = []
    for fname in os.listdir(UPLOAD_FOLDER):
        if not fname.endswith(('.enc', '.sig', '.hash', '.key')):
            file_path = os.path.join(UPLOAD_FOLDER, fname)
            if os.path.isfile(file_path):
                file_stat = os.stat(file_path)
                files.append({
                    'filename': fname,
                    'size': file_stat.st_size,
                    'upload_time': file_stat.st_mtime * 1000  # Convert to milliseconds
                })
    
    # Sắp xếp theo thời gian upload mới nhất
    files.sort(key=lambda x: x['upload_time'], reverse=True)
    
    return jsonify({'success': True, 'files': files})

# Route để download file
@app.route('/download/<filename>')
def download_file_direct(filename):
    return send_from_directory(UPLOAD_FOLDER, filename, as_attachment=True)

if __name__ == '__main__':
    app.run(debug=True) 