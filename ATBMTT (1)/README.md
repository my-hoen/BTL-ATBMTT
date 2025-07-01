# Đề tài 11: Mô phỏng upload/download video lên cloud với xử lý lỗi mạng

## Mô tả
Ứng dụng mô phỏng quá trình upload/download file video.mp4 lên Google Cloud Storage qua socket và download để kiểm tra, mô phỏng lỗi mạng (mất gói tin, timeout) để thử nghiệm cơ chế retry tái gửi dữ liệu. File được mã hóa bằng AES-CBC, ký số metadata bằng RSA/SHA-512, và kiểm tra toàn vẹn để mô phỏng các bước bảo mật thực tế của cloud.

## Yêu cầu kỹ thuật
- **Mã hóa:** AES-CBC
- **Trao khóa & ký số:** RSA 2048-bit (PKCS#1 v1.5 + SHA-512)
- **Kiểm tra tính toàn vẹn:** SHA-512
- **Kênh truyền:** Giao thức socket (TCP) - mô phỏng qua HTTP
- **Xử lý:** Mô phỏng lỗi mạng (mất gói tin, timeout) và retry tái gửi dữ liệu
- **Hỗ trợ:** Upload và download file video

## Luồng xử lý

### 1. Handshake (Upload)
- Người gửi (Client) gửi "Hello!" qua socket đến Google Cloud Storage giả lập
- Dịch vụ cloud trả lời "Ready!" qua socket
- **Mô phỏng lỗi:** 15% xác suất handshake thất bại, tự động retry

### 2. Xác thực & Trao khóa (Upload)
- Người gửi ký metadata (tên file, timestamp, kích thước video) bằng RSA/SHA-512
- Người gửi mã hóa SessionKey bằng RSA 2048-bit (PKCS#1 v1.5) và gửi qua socket
- **Mô phỏng lỗi:** 10% xác suất trao khóa thất bại, tự động retry

### 3. Mã hóa & Kiểm tra toàn vẹn (Upload)
- Tạo IV ngẫu nhiên
- Mã hóa file bằng AES-CBC để tạo ciphertext
- Tính hash: SHA-512(IV || ciphertext)
- Upload gói tin qua socket, mô phỏng lỗi mạng:
  - **Lỗi mất gói tin:** 20% xác suất gói tin không đến được cloud
  - **Lỗi timeout:** 10% xác suất timeout 5 giây
  - **Retry logic:** Tự động retry cho đến khi thành công
- Gói tin có định dạng JSON:
```json
{
    "iv": "<Base64>",
    "cipher": "<Base64>",
    "hash": "<hex>",
    "sig": "<Signature>"
}
```

### 4. Phía Người nhận (Dịch vụ cloud)

#### Upload xử lý:
- Kiểm tra hash và chữ ký của gói tin nhận được
- Nếu tất cả hợp lệ:
  - Giải mã ciphertext bằng AES-CBC
  - Lưu file video.mp4 trên cloud
  - Gửi ACK qua socket tới Người gửi
- Nếu hash hoặc chữ ký không hợp lệ:
  - Từ chối, gửi NACK (lỗi integrity) qua socket
- Nếu lỗi mạng xảy ra (mất gói tin hoặc timeout):
  - Người gửi phát hiện không nhận được ACK trong 5 giây
  - Người gửi retry tái gửi gói tin cho đến khi thành công
  - Đảm bảo file upload luôn toàn vẹn, không bị mất dữ liệu

#### Download xử lý:
- Người nhận gửi yêu cầu download qua socket, kèm chữ ký RSA/SHA-512
- Cloud kiểm tra chữ ký của Người nhận
- Nếu xác thực hợp lệ:
  - Cloud đọc file và tạo download URL
  - Người nhận có thể tải file về máy
- Nếu xác thực không hợp lệ:
  - Cloud từ chối, gửi NACK (lỗi auth) qua socket

## Cài đặt và chạy

### Yêu cầu hệ thống
- Python 3.8+
- pip

### Cài đặt thư viện
```bash
pip install -r requirements.txt
```

### Chạy ứng dụng
```bash
python app.py
```

### Truy cập ứng dụng
- **Trang chủ:** http://localhost:5000
- **Client (Người gửi):** http://localhost:5000/client
- **Cloud (Người nhận):** http://localhost:5000/cloud

## Hướng dẫn sử dụng

### 1. Upload file video (Client)
1. Truy cập **Client - Người gửi**
2. Chọn file video để upload
3. Nhấn **"1. Handshake"** - Thiết lập kết nối với cloud
4. Nhấn **"2. Xác thực & Trao khóa"** - Xác thực và trao đổi khóa
5. Nhấn **"3. Upload file"** - Upload file với mô phỏng lỗi mạng
6. Xem log chi tiết từng bước trong quá trình upload

### 2. Download file video (Cloud)
1. Truy cập **Cloud - Người nhận**
2. Xem danh sách file đã upload với thông tin chi tiết
3. Chọn file để download từ dropdown hoặc nhấn nút Download trực tiếp
4. Xem log quá trình xác thực và download
5. File sẽ tự động được tải về máy nếu thành công

## Cấu trúc dự án
```
ATBMTT/
├── app.py                 # Backend Flask chính
├── requirements.txt       # Thư viện Python cần thiết
├── README.md             # Hướng dẫn sử dụng
├── templates/            # Giao diện HTML
│   ├── index.html        # Trang chủ
│   ├── client.html       # Giao diện Client
│   └── cloud.html        # Giao diện Cloud
└── static/               # File tĩnh
    └── cloud_storage/    # Thư mục lưu file trên cloud
```

## API Endpoints

### Client endpoints
- `POST /handshake` - Thiết lập kết nối với cloud
- `POST /auth_key_exchange` - Xác thực và trao đổi khóa
- `POST /upload_file` - Upload file video

### Cloud endpoints
- `POST /download_file` - Download file video (FormData)
- `GET /list_files` - Lấy danh sách file đã upload
- `GET /download/<filename>` - Download file trực tiếp

## Tính năng nổi bật

### Bảo mật
- **Mã hóa AES-CBC:** File được mã hóa với IV ngẫu nhiên
- **Trao khóa RSA-2048:** Session key được mã hóa bằng RSA
- **Ký số RSA/SHA-512:** Metadata và hash được ký số
- **Kiểm tra toàn vẹn:** Hash SHA-512 đảm bảo file không bị thay đổi

### Xử lý lỗi mạng
- **Mô phỏng mất gói tin:** 20% xác suất gói tin bị mất
- **Mô phỏng timeout:** 10% xác suất timeout 5 giây
- **Retry tự động:** Retry cho đến khi thành công
- **ACK/NACK:** Xác nhận thành công/thất bại cho từng gói

### Giao diện
- **2 bên riêng biệt:** Client và Cloud có giao diện riêng
- **Log chi tiết:** Hiển thị từng bước xử lý
- **Trạng thái real-time:** Cập nhật trạng thái theo thời gian thực
- **Responsive:** Hỗ trợ nhiều thiết bị
- **UI chuyên nghiệp:** Thiết kế hiện đại với icons và layout rõ ràng

## Lưu ý khi sử dụng
- File video nên có kích thước vừa phải để test (dưới 100MB)
- Quá trình upload có thể mất thời gian do mô phỏng lỗi mạng và retry
- Log sẽ hiển thị chi tiết từng bước để dễ dàng debug
- File được lưu trong thư mục `static/cloud_storage/`
- Download sử dụng FormData thay vì JSON để tương thích tốt hơn

## Điều kiện thành công

### Upload thành công khi:
- Handshake thành công (có thể retry)
- Xác thực và trao khóa thành công (có thể retry)
- Gói tin được gửi thành công (retry cho đến khi thành công)
- Cloud xác nhận file đã được lưu

### Download thành công khi:
- Chữ ký Client hợp lệ
- File tồn tại trên cloud
- Download URL được tạo thành công

## Tác giả
Xây dựng theo yêu cầu đề tài 11 - Mô phỏng upload/download video lên cloud với xử lý lỗi mạng.

## Ý nghĩa mô phỏng
- **Bảo mật:**
  - File được mã hóa AES-CBC, session key sinh ngẫu nhiên, IV ngẫu nhiên.
  - Hash SHA-512(IV||ciphertext) đảm bảo toàn vẹn.
  - Chữ ký số RSA-2048 đảm bảo xác thực nguồn gửi.
- **Xử lý lỗi mạng:**
  - Mỗi gói truyền có thể bị mất, timeout, sẽ tự động retry cho đến khi thành công.
  - Đảm bảo file upload luôn toàn vẹn, không bị mất dữ liệu.
- **Log chi tiết:**
  - Ghi rõ từng bước mã hóa, truyền nhận, retry, ACK/NAK, kiểm tra toàn vẹn, xác thực, giải mã.

## Lưu ý quan trọng
- Không giới hạn loại file, nhưng file lớn sẽ truyền lâu hơn do mô phỏng lỗi mạng.
- Không nên xóa/sửa file trong thư mục `static/cloud_storage` để tránh lỗi integrity khi download.
- Nếu gặp lỗi, xem log chi tiết để biết nguyên nhân (mất gói, hash mismatch, signature invalid...)
- Hệ thống retry đảm bảo file upload luôn thành công, nhưng có thể mất thời gian

## Tác giả & liên hệ
- Xây dựng bởi AI theo yêu cầu mô phỏng bảo mật, truyền nhận, xử lý lỗi mạng.
- Nếu cần hỗ trợ, góp ý, hoặc mở rộng, hãy liên hệ lại qua phần chat! 