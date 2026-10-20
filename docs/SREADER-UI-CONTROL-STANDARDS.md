# sReader UI — quy chuẩn kích thước điều khiển (LOCK)

Ngày chốt: 2026-10-20, theo hai ảnh người dùng cung cấp cho thanh Zoom mảnh và bộ Font / Cỡ chữ / Màu chữ.

## Một kiểu thanh trượt dùng chung
- Mọi `input[type=range]` **trong sReader Windows** phải dùng chung quy tắc CSS tại `desktop/ui/reader.css`, mục **sReader control standard**. Không viết các khối `::-webkit-slider-*` riêng cho từng công cụ.
- Thanh (track): **2 px**, mảnh, thẳng, màu xám trung tính. Núm (thumb): tròn **10 × 10 px**, nền sáng, viền xám 1 px. Hit area vẫn **20 px** để thao tác touchpad/chuột dễ dàng.
- Zoom ở footer, Độ mờ trong Format và bất kỳ slider mới nào sau này đều cùng hình học; vẫn giữ các miền giá trị, xử lý `input` và khả năng thao tác bằng bàn phím như cũ.
- Giao diện tối đổi màu rail/thumb bằng token nhưng **không đổi kích thước**; focus rõ ràng. Không làm đứt chức năng pinch-to-zoom đã FIELD-PASS.
- Token khóa: `--reader-range-track`, `--reader-range-border`, `--reader-range-thumb`.

## Một chuẩn cho các ô nhập Format
- Nhãn phía trên: chữ **11 px**, vùng nhãn có chiều cao đồng nhất **28 px**.
- Ô nhập / Select / Màu: chiều cao chung **32 px**, viền 1 px và bán kính 5 px. Hàng Font / Cỡ chữ / Màu chữ phải cùng tọa độ Y ở cả cạnh trên lẫn cạnh dưới.
- Cột dùng `minmax(0, 1fr) 74px 62px`, khoảng cách **7 px**. Font có chỗ rộng nhất, Cỡ chữ và Màu chữ cân đối và không tràn khỏi bảng Format.
- Các ô chỉnh khác trong Format, bao gồm màu tùy chỉnh, chọn độ dày nét và giãn dòng, dùng cùng token `--reader-control-height` khi không có lý do rõ ràng để khác.
- Không thu hẹp vùng click để chạy theo vẻ ngoài mảnh của thanh slider. Không đẩy bảng Format đè lên vùng nội dung PDF.

## Kiểm thử bảo vệ
`desktop/reader-tests/reader-feedback.spec.mjs` kiểm tra slider, nhãn, kích thước thực tế trong cả light/dark ở viewport 1024 và 1440 px; xuất ảnh chẩn đoán riêng. `desktop/reader-tests/assets.test.mjs` khóa quy tắc nguồn CSS. Không nới test chỉ để CI PASS.

## Ranh giới
Chỉ sReader; không đổi sTool/Toolbox, PDF engine, icon đã chốt, font Windows hay native Tauri. Mọi thay đổi phải chạy **Reader-only CI** trước khi xem là bản Windows có thể thử, sau đó kiểm tra thực tế trên máy người dùng.
