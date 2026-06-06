# Specification: AI Browser Agent

## 1. Công nghệ & Ngôn ngữ
Toàn bộ hệ thống bắt buộc sử dụng **Node.js** với **TypeScript**. Không sử dụng ngôn ngữ hay runtime nào khác.

## 2. Mục tiêu hệ thống
Xây dựng một AI Agent có khả năng điều khiển trình duyệt thông qua Gemini API để thực hiện các tác vụ tự động hóa một cách tối giản và hiệu quả.

## 3. Kiến trúc Mô-đun (Minimalist Design)

Hệ thống được chia thành 3 mô-đun chính với phụ thuộc như sau:

### 3.1. Mô-đun Core (Trình điều khiển)
- **Nhiệm vụ**: Quản lý vòng đời của trình duyệt (launch, close, interact).
- **Công nghệ**: `Playwright-core`, msedge có sẵn trên windows + stealth plugin với `TypeScript`.
*tuyệt đối ko cài full playwright, chỉ được phép sử dụng các module như đã đề cập bên dòng trên*
### 3.2. Mô-đun Brain (Tư duy & Điều khiển)
- **Nhiệm vụ**: Phân tích trạng thái trình duyệt và ra quyết định bước tiếp theo.
- **Phụ thuộc**: Gọi **Core** để lấy trạng thái và thực hiện hành động. Gọi Gemini API.
### 3.3. Mô-đun Interface (Tương tác)
- **Nhiệm vụ**: Cầu nối giữa người dùng và Agent.
- **Phụ thuộc**: Gọi **Brain** để bắt đầu tiến trình xử lý prompt.
**ở trong thư mục của mỗi module có file `interface.ts` là contract để các module phụ thuộc sử dụng module đó**
### 3.4. Sơ đồ phụ thuộc (Dependency Flow)
`Interface` -> `Brain` -> `Core` -> `Browser/LLM`
## 4. Workflow thực thi
1. **Khởi tạo**: Hệ thống khởi chạy trình duyệt theo cấu hình.
2. **Nhận Prompt**: Người dùng nhập yêu cầu qua CLI.
3. **Vòng lặp Agent (Agent Loop)**:
    - **Quan sát**: Chụp trạng thái màn hình/DOM.
    - **Suy luận**: Gửi dữ liệu về Gemini API.
    - **Hành động**: Thực thi hành động do LLM yêu cầu trên trình duyệt.
    - **Kết thúc**: Dừng khi nhiệm vụ hoàn thành hoặc đạt giới hạn số bước.
