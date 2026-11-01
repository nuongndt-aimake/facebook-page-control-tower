# Báo cáo

## Page

Hiển thị Page, BM, nguồn tài sản, token health, lần đồng bộ, bài đăng, tương tác, metric và doanh thu.

## Nội dung

Mỗi bài phải có `page_id`, `page_name`, kỳ dữ liệu, chỉ số tương tác và permalink. Hỗ trợ nhóm theo Page, tìm kiếm, lọc, phân trang và mở rộng/thu gọn. Bộ lọc bài viết chỉ tác động lên danh sách bài; không được làm thay đổi lưới/biểu đồ doanh thu theo Page. Tương tác ưu tiên snapshot `post_metric_snapshots` mới nhất trong kỳ, sau đó mới fallback về `posts.raw_json`.

## Doanh thu

Tách rõ:

1. `estimated_api` — dữ liệu Meta trả về.
2. `manual` — dữ liệu nhập/đối soát thủ công.
3. `reconciled` — dữ liệu đã xác nhận.
4. Payout và hoa hồng.

Không cộng hai nguồn khi chưa có quy tắc đối soát.

## UX bắt buộc

- Luôn hiển thị kỳ dữ liệu và thời điểm cập nhật.
- Không hiển thị nhãn kỹ thuật trong giao diện thông thường.
- Desktop không overlap.
- Mobile dùng card, menu nổi và không ép cuộn ngang.

