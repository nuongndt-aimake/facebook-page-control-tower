# Nâng cấp webhook, giá, dữ liệu và menu — 2026-11-19

Trạng thái: Đang triển khai. Kế hoạch chia thành các luồng độc lập, tích hợp sau khi hoàn tất kiểm thử từng phần.

| Luồng | Công việc | Phụ thuộc | Nghiệm thu |
| --- | --- | --- | --- |
| A | RPC webhook transaction, khóa đơn, unique event, chặn hai lần ghi paid | Migration trước API | Hai phiên DB gọi cùng event và hai event cùng đơn; chỉ một processed |
| B | Giá hiệu lực server, loại giá/tier hardcode trên UI | Độc lập A/C/D | Giá hiện tại và tương lai, các tier không hết hạn |
| C | Bảng đơn đủ mỗi trường/mỗi cột; cuộn ngang nội bộ | Độc lập A/B/D | Không gộp/ẩn cột trên điện thoại; vẫn lọc quyền server |
| D | Tên Page nhập kho/lưu/hiển thị; đủ dữ liệu kho theo cột | Migration page_name, độc lập A | Page cũ có fallback; tạo mới có tên |
| E | Menu active, click/hover desktop, click mobile, đóng panel | Độc lập API/database | 390/768/desktop, click ngoài, Escape, focus |

Impact note: API webhook chuyển từ chuỗi request sang một RPC transaction; migration additive thêm page_name, chức năng RPC chỉ service_role được gọi, RLS không mở. Kho giữ RBAC intake/read hiện tại. Không thêm role hay thay domain/cron/SePay credentials. Orders chỉ trả dữ liệu trong phạm vi owner/assignment/read_all; bảng đầy đủ không được kéo thêm dữ liệu trái quyền. Tài liệu frontend, API/runbook, test và log cập nhật cùng thay đổi.

Quy ước responsive bảng **hết hiệu lực riêng với đơn hàng/kho từ 2026-11-19**: tự ẩn cột hoặc ép thành card. Thay thế bằng bảng có đủ cột, thanh cuộn ngang nằm trong khung bảng theo yêu cầu người dùng; trang tổng thể không tràn ngang. Những màn hình khác giữ quy ước cũ.

Thứ tự phát hành: phần UI độc lập có thể kiểm tra trước; migration được áp dụng và xác nhận trước khi deploy API gọi RPC. Giữ lịch sử đơn cũ, không chỉnh giá đã được người dùng cấu hình để test. Test concurrency chỉ dữ liệu QA, không chuyển tiền thật và không bàn giao/quyền lợi thật.

## Thiết kế đã áp dụng

- Webhook xác thực xong chỉ gọi sales_process_payment_event. Unique provider_event_id chặn cùng event; SELECT FOR UPDATE theo đơn chặn event khác nhau cùng chốt đơn. Event/order/invoice cùng transaction; lỗi làm rollback để provider retry không mất cập nhật. Đơn paid không bị hạ trạng thái; đơn cancelled/refunded không bị ghi paid. RPC SECURITY INVOKER, search_path cố định, chỉ service_role được gọi.
- Giá public không còn literal 1.500.000đ hoặc tier cố định. /api/sales-config trả giá hiệu lực và discount_tiers còn hiệu lực; response no-store. Báo giá cập nhật cả đơn giá; trang mở lâu đọc lại config mỗi 60 giây trước khi tạo đơn. Giữ snapshot giá khi đã tạo đơn, không hồi tố.
- Bảng đơn hiển thị từng field của order/product/invoice/assignment bằng cột riêng, kể cả field bổ sung trong tương lai mà API trả về trong phạm vi người dùng. Không trả gift link trước thanh toán. Bảng giữ cột trên 390px, scroll ngang nội bộ, header cố định.
- Kho thêm page_name nullable để tương thích kho cũ; nhập mới yêu cầu tên. Có thao tác cập nhật tên Page cho người có intake, kiểm tra server và audit. Bảng kho hiển thị riêng các trường item/detail/inhouse, không đồng bộ Facebook để đoán tên cũ.
- Menu dùng trạng thái aria-current=page, đánh dấu cả nhóm chứa trang active. Desktop >900px: click/hover với chuột; <=900px: nút Menu và accordion tap, không kích hoạt hover. Chọn link/click ngoài/Escape/resize đóng menu; ArrowDown mở và focus submenu.

## Kết quả database trước phát hành API

Migration CLI tạo ban đầu 20261119100547; đổi thứ tự thành 20261119203000 vì phụ thuộc bảng trong foundation 193000. Đã chạy migration production trong transaction.

Hai phiên PostgreSQL chạy chồng lấp, phiên A giữ lock 8 giây:

| Fixture | Event rows | processed | duplicate | Kết quả |
| --- | --- | --- | --- | --- |
| FSQA19110001, cùng provider event | 1 | 1 | 0 (request B trả duplicate, không thêm row) | Đạt |
| FSQA19110002, hai provider event khác nhau | 2 | 1 | 1 | Đạt |

Hai order và invoice QA đã chuyển cancelled sau test, fulfillment luôn cancelled. Giữ event lịch sử với raw_payload.qa=true; không có chuyển tiền/bàn giao/hoá đơn thật. SQL kiểm tra quyền RPC: anon=false, authenticated=false, service_role=true.

Test Node API dùng 20 request Promise.all cùng event và 20 event khác nhau/đơn; chỉ 1 processed. Mock xác nhận API gọi một RPC, kiểm thử PostgreSQL thật ở trên mới là bằng chứng lock/transaction. Test mã sai xác thực, số tiền sai kiểu, bảng đầy đủ cột/escape HTML, ownership và token tiếp tục được chạy.

## Ghi nhận QA giao diện sau phát hành

- Đã thấy giá public 1.500.000đ từ bản giá hiệu lực 2026-11-19 09:47:51 giờ Việt Nam. Bản 3.000.000đ ngày 20 chưa đến hạn; bản 3.000.000đ ngày 19 lúc 00:00 bị thay thế bởi bản 09:47. Không sửa dữ liệu giá của người dùng. Vì vậy số đang thấy giống trước không có nghĩa đang hardcode; response công khai có price_effective_from để đối chiếu.
- Bảng đơn ban đầu 48 cột, sau bổ sung schema cố định luôn có cả cột phân công khi chưa có người nhận. Toàn bộ cell giữ display table-cell trên mobile; khung bảng có tabindex/role/aria-label cho cuộn bàn phím. Kho bỏ cột tên Page lặp lại.
- 390px đã kiểm tra panel tap, mở nhóm Tài khoản, aria-current Đơn hàng, đóng khi click ra ngoài. Không tràn trang; bảng cuộn riêng, không cell nào bị ẩn.
- Runtime tương tác menu dùng một file navigation.js tải bởi auth-nav.js, không duy trì hai bộ listener cũ/mới cùng lúc. CSS chung navigation.css chỉ tác động navigator.
- Các route giới thiệu con (lộ trình/chương trình/chính sách) đánh dấu section Giới thiệu; control/operations/sync cũ đánh dấu nhóm Vận hành. aria-current=page chỉ dùng khi URL liên kết khớp đúng route.
