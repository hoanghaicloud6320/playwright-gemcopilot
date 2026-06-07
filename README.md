# đây là gì?
 - đây là công cụ AI agent có khả năng sử dụng trình duyệt (browser-use), sử dung backend là llm qua gemini API
# có khả năng làm gì?
 - ...
# không có khả năng làm gì?
 - thao tác toàn diện với hệ điểu hành
# ngôn ngữ + hệ thống:
 - Typescript (node)
 - chạy được trên windows, linux (có nodejs là được)

# workflow:
 - launch tool (tool sẽ tự launch 1 profile mà user chỉ định riêng cho agent, hoặc chạy ẩn danh tuỳ user config)
 - user có thể nhập prompt yêu cầu agent làm việc (user đồng thời cũng có khả năng tương tác trên trình duyệt mà agent đang sử dụng)
 - sau khi user bấm enter thì agent sẽ làm việc (multi-step) đến khi llm quyết định dừng (hoàn thành nhiệm vụ, lỗi phát sinh, ....)
# hướng dẫn sử dụng
  - cấu hình trong file `.env`:
   + `GOOGLE_API_KEY=your_gemini_api_key_here` (bắt buộc)
   + `model=...` (bắt buộc)
   + `EDGE_PROFILE_PATH=path_to_profile` (optional)
  - chạy lệnh: `npm install` để tải các dependency sau khi clone về máy
  - chạy `npm start`