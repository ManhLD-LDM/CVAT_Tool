# CVAT 3D TOOL 1.12.2

Extension hỗ trợ gán nhãn cuboid và QC hình học trong CVAT 3D, kèm demo WebGL ngoại tuyến. Adapter hiện dựa trên cấu trúc editor CVAT 2.76. Tool dùng rule và hình học trên point cloud; chưa có mô hình AI nhận diện loại vật thể hoặc đầu/đuôi xe.


Repository còn giữ bộ script Python và cấu hình `config/` từ phiên bản trước. Tài liệu được lưu tại [Python tracking suite (lịch sử)](docs/PYTHON_TRACKING_SUITE_LEGACY.md); các tuyên bố tracking của bộ script đó chưa được kiểm chứng lại trong đợt extension 1.8.0. Dùng biến môi trường theo `config/.env.example`, không commit cookie/token hay dữ liệu job cục bộ.

## Cài đặt và sử dụng

Giải nén `dist/CVAT-3D-Tool-Extension-1.12.2.zip`, hoặc dùng thư mục `extension/`. Trong Edge/Chrome Extensions, bật Developer mode → Load unpacked → chọn thư mục chứa manifest.json. Mở job 3D trên domain được khai báo trong manifest: CVAT Transformer Labs, CVAT.ai, Vantix hoặc localhost.

Sau cài đặt/cập nhật extension, refresh tab một lần. Các thao tác tiếp theo cập nhật editor và render mà không cần refresh. Extension đọc cả annotation chưa Save; dùng **Save trong CVAT** để lưu lên server.

Demo: mở `dist/CVAT-3D-Copilot-Demo.html` bằng Edge/Chrome, không cần mạng hoặc đăng nhập. Demo dùng 61 cuboid từ cache Job 9426 với Z đặt lại theo ground mô phỏng, point cloud và ca lỗi được tạo chủ động; demo không thay thế kiểm chứng trên CVAT thật. UI hiện dùng tiếng Anh và hiển thị subtype của box.

## Batch Track Review — 1.8.0

Bản đầu của quy trình chỉnh cùng một vật thể qua nhiều frame, lấy cảm hứng workflow SUSTechPOINTS và tự triển khai tích hợp CVAT. Chưa phải tracker có bù chuyển động cảm biến.

1. Chọn một **CUBOID TRACK** trong CVAT → **Batch Track Review**. Shape độc lập và demo 61 box hiện tại không hỗ trợ batch.
2. Tool đọc track từ native editor (gồm cả chỉnh sửa chưa Save), đọc PCD của các frame bằng job.frames.get().data(), hiển thị 7 frame/lượt với Top/Side/Front đồng nhất tỷ lệ trong từng card.
3. Box cam là geometry hiện tại, xanh là đề xuất vị trí. Tool giữ nguyên kích thước, yaw, roll/pitch; tinh chỉnh chỉ hỗ trợ upright box. Nếu ground đủ tin cậy có thể điều chỉnh Z, nếu không thì giữ Z.
4. Keyframe native hiện có (ví dụ 0,7,14) luôn được bảo vệ. **Protect this frame** chỉ bảo vệ thêm trong phiên batch hiện tại; đóng/mở lại sẽ không giữ bảo vệ tạm này.
5. Chỉ đề xuất frame nằm giữa hai keyframe có vật thể hiện diện. Không tự suy ra tracking từ sau keyframe cuối hoặc qua outside/che khuất. Point support, mức dịch chuyển và độ lớn cụm được kiểm tra để chặn đề xuất không hợp lý; đây là chỉ báo hình học, không phải xác suất tracker đúng.
6. Tick **Accept this proposal** cho frame đã xem, rồi **Apply selected position proposals**. Tối đa 20 frame/lần (UI chọn trong trang 7 frame đang xem). Chỉ ghi các frame được chọn; giữ nguyên track ID, keyframe gốc và frame bảo vệ. Mỗi frame là một native Undo entry; không có Undo gộp toàn batch.
7. **Open in CVAT** chuyển tới đúng frame/track rồi đóng preview chưa áp dụng. Chỉnh tay một mốc trong CVAT, mở lại batch để tính theo mốc mới.
8. **Export preview (.json)** xuất baseline, đề xuất và ROI đã lấy mẫu của trang đang xem để chẩn đoán. Không phải định dạng import annotation hoặc full raw point-cloud sequence.

Preview không ghi annotation. Apply dùng ObjectState.save và cập nhật editor/history, không REST PATCH hay tự Save server. Track đổi trong lúc preview sẽ bị chặn; workspace review/đang vẽ/box khóa cũng bị chặn khi apply. Lỗi giữa chừng trả danh sách frame đã ghi; kiểm tra Undo/history trước khi thử lại, không tự rollback giả. Sau apply phải đóng/mở lại preview.

Chỉ cache hai cloud trong bộ xử lý batch; mỗi PCD tối đa 128 MiB. ROI hiển thị tối đa 4.000 điểm/frame, thuật toán phân tích ROI chưa lấy mẫu. Nạp frame đầu có thể chậm vì native tải/giải nén chunk. Chưa có worker nền, ego-motion/pose registration, forward/backward tracking, AI tracker hay temporal QC đầy đủ. Không coi box đủ điểm hoặc ít lỗi QC là ground truth.

Pilot cho job601: giữ anchors0/7/14, xem #1/#2/#5 ở các frame3/4/10/11, chỉ chấp nhận sau kiểm tra Top/Side/Front. Chưa chạy apply batch trên job thật trong đợt phát triển này.
[Thiết kế và phần còn lại](docs/BATCH_TRACK_REFINEMENT_PROPOSAL.md) · [Bằng chứng kiểm thử](docs/verification/batch-1.8.0.md).

## Phiên CVAT và Import/Export — 1.7.0

Bấm **Phiên CVAT & Import/Export** trên HUD để mở trang riêng của extension. Không hoạt động trong demo. Extension cần thêm quyền cookies và downloads; trình duyệt có thể yêu cầu chấp nhận quyền mới khi cập nhật.

- **Lấy thông tin phiên:** kiểm tra người dùng bằng API users/self, chỉ đọc cookie sessionid/CSRF khi bấm nút. Giá trị mặc định che; có nút hiện/copy/xóa. Cookie HttpOnly được đọc bằng service worker, chỉ trả về trang extension, không chuyển qua bridge CustomEvent hay DOM của CVAT. Rời tab sẽ xóa giá trị hiển thị; không lưu vào storage/log/file chẩn đoán. Cookie đã copy vẫn có thể còn trong clipboard.
- **Copy mẫu Python:** dùng biến môi trường CVAT_SESSIONID/CVAT_CSRFTOKEN, URL server và job hiện tại; không nhúng cookie thật. Mẫu kiểm tra đăng nhập và ghi chú endpoint import/export, chưa là CLI import/export đầy đủ.
- **Export:** đọc định dạng từ server, export annotation đã Save của job hiện tại, theo dõi rq_id rồi tải file. Không cần đọc sessionID trước.
- **Import:** chọn file/định dạng, nhập job ID và xác nhận tác động. Tool export bản dự phòng theo định dạng export đã chọn và chờ download hoàn tất trước khi upload. Import có thể thay thế annotation server, không có Undo native. File và download tối đa **8 MiB**; dữ liệu lớn hơn dùng giao diện native CVAT. Save editor trước khi bắt đầu.
- Sau import, bấm **Nạp lại tab CVAT** trước khi tiếp tục sửa. Không Save editor cũ. Bản này dùng reload có chủ đích để đồng bộ dữ liệu import; Auto-Fit/QC và các thao tác box vẫn cập nhật realtime.
- Khi đã gửi import, transport chặn import/export mới đến khi tab CVAT reload. Nếu timeout/đóng trang, tác vụ server có thể vẫn chạy: kiểm tra Requests trước khi thử lại.
- Chỉ làm việc với tab/job đã mở; đổi server/job sẽ chặn thao tác. Phiên adapter nội bộ không phải sessionid đăng nhập. SSO/token-only hoặc cookie có tên tùy biến chưa có chức năng copy tương ứng; API vẫn dùng cookie phiên trình duyệt nếu server hỗ trợ.
- API chỉ gọi các endpoint giới hạn qua runtime message trong isolated world, cùng origin CVAT, credentials include và CSRF cookie. Không dùng cookie đọc ra để gắn Cookie header thủ công.

Đối chiếu API: [mã nguồn CVAT 2.76](https://github.com/cvat-ai/cvat/blob/v2.76.0/cvat/apps/engine/views.py), [Jobs API](https://docs.cvat.ai/docs/api_sdk/sdk/reference/apis/jobs-api/). Import/export dùng POST và theo dõi GET /api/requests/{rq_id}. Mới kiểm thử bằng mock server/extension API, chưa chạy import ghi dữ liệu trên CVAT thật. Chưa chứng nhận compatibility cho mọi deployment/SSO/cấu hình CSRF.

## Class và subtype hiện tại

Theo cấu hình công việc thực tế, **vehicles hiện hỗ trợ nhiều loại xe theo subtype**, không còn giới hạn toàn bộ class ở xe gia đình như bản 1.5.0.

Adapter đọc attributes từ ObjectState, ánh xạ ID attribute sang tên của label. Subtype ưu tiên từ `type`, `vehicle_type`, `subtype`, `sub_type`, `category`; nếu không có, thử tìm giá trị subtype đã biết trong các attributes khác. Giá trị được trim và chuyển chữ thường.

QC và Auto-Fit giải quyết profile theo class + subtype. Nếu vehicles thiếu subtype hoặc subtype không được nhận biết, dùng profile xe gia đình mặc định (car). Tool **không tự suy subtype từ LiDAR**. Chọn đúng attribute trong CVAT trước khi Auto-Fit; panel chỉ hiển thị subtype, chưa có bộ chọn subtype riêng.

Các khoảng dưới đây là cấu hình tham khảo của tool, đơn vị mét; không phải tiêu chuẩn được chứng nhận:

| Subtype của vehicles | Dài | Rộng | Cao |
|---|---:|---:|---:|
| `car` | 2.8–5.8 | 1.4–2.3 | 1.1–2.2 |
| `truck` | 5–14 | 1.9–3 | 2–4.2 |
| `bus` | 6.5–15 | 2.2–3.2 | 2.6–4.2 |
| `van` | 4.2–6.5 | 1.7–2.4 | 1.8–2.8 |
| `pickup` | 4.5–6.5 | 1.7–2.3 | 1.6–2.4 |
| `construction` | 3.5–12 | 2–3.5 | 1.8–4.5 |
| `trailer` | 4–16 | 1.9–3 | 1.5–4.5 |
| `tricycle` | 1.8–3.8 | 0.9–1.8 | 1.1–2.2 |
| `stroller` | 0.6–1.4 | 0.4–0.9 | 0.7–1.4 |
| `wheelchair` | 0.7–1.6 | 0.5–1.1 | 0.7–1.5 |
| `other` | 1.5–15 | 0.8–3.5 | 0.8–4.5 |

Chấp nhận cả `construction` và cách viết `contruction` để tương thích dữ liệu hiện có. Các khóa Trailer/Tricycle/Stroller/Wheelchair có alias khác kiểu chữ. Resolver cũng chấp nhận nhãn `vehicle`, `car`, `cars` và khóa trực tiếp như `vehicles:bus`.

| Class khác | Dài | Rộng | Cao |
|---|---:|---:|---:|
| `two-wheels` | 1.4–2.6 | 0.5–1.3 | 0.9–1.9 |
| `pedestrian` | 0.3–1 | 0.3–1 | 1.3–2.1 |
| `Animal` | 0.4–2.5 | 0.3–1.2 | 0.3–1.8 |
| `Obstacle` | 0.2–5 | 0.2–5 | 0.2–5 |

Alias được nhận biết: bicycle/motorcycle/cyclist/two_wheels → two-wheels; person → pedestrian; animal và obstacle được đối chiếu không phân biệt chữ hoa/thường. Khi fit class có tên chính xác `two-wheels`, chiều rộng tối thiểu là 0,6 m; profile QC cơ sở vẫn có min width 0,5 m. Class chưa có profile sẽ không được Auto-Fit.

## Auto Adjust Box — 1.10.0

Select a box and click **Auto Adjust Box**, or press **Alt+Shift+B** (remappable in Keyboard shortcuts). This cleans up nearby sides and the top while preserving direction and ground contact.

- Expand supported faces to catch nearby missed object points, within a 0.4 m local search/correction range and with 3 cm padding.
- **Near-ground exclusion (1.10.1):** ignore points at or below 20 cm above the local ground plane before clustering or measuring faces. The clearance increases to three times the plane RMSE when larger. It follows the slope at each point; raw ground points remain available for ground estimation and bottom contact. If only low returns remain, leave the box unchanged. See [ground exclusion verification](docs/verification/ground-exclusion-1.10.1.md).
- Configure inward shrink limits under **Settings & shortcuts → Auto Adjust Box**. Defaults are **10 cm and 5% of that dimension**; the smaller limit applies to each face. Distance accepts 0–40 cm and percentage accepts 0–50%. Either value at zero disables shrinking. Settings persist across jobs and restarts; **Reset shrink limits** restores defaults. Shrink only when a supported surface is already within this limit from the current face. Keep distant faces unchanged; do not take small steps toward faraway returns. Repeated actions therefore preserve an occluded rear rather than progressively cutting it off.
- Side shrinking also requires vertical surface support; top shrinking requires a supported XY patch. Roof-only evidence does not justify bringing in side faces. Ground, isolated noise, and neighboring annotation points are excluded.
- Keep heading fixed, including when Move to mouse's Adjust direction is enabled. Keep the bottom on reliable ground. Weak ground, empty/ambiguous object evidence, tilted boxes, or unsuitable final ground leave the box unchanged.
- Apply at most one native edit to the current frame, with normal Undo/Redo. A no-op does not create a keyframe/history entry. Save through CVAT as usual.

This is local cleanup of the existing box; class dimension profiles do not force it toward preset minimum sizes. The original Auto-Fit remains available for a broader refit. Inspect the resulting annotation. See [Auto Adjust verification](docs/verification/auto-adjust-1.10.0.md).

## Auto-Fit

### New in 1.9.0: direction, placement, and shortcuts

- **Keep direction**, beside Auto-Fit, resizes and recenters using the current heading. It starts unchecked and remembers your choice. Auto-Fit requires an upright box.
- **Move to mouse — Alt+Shift+M:** select a box, hover roughly near the intended object in the native **top view**, then press the shortcut. In 1.9.1 the tool searches nearby LiDAR clusters and refines the box center from the closest suitable object. Dimensions stay unchanged; rotation stays unchanged unless **Adjust direction** is enabled. Sparse, ambiguous, oversized, or already annotated evidence keeps the raw mouse placement with a warning. Ground is estimated at the final footprint; unsuitable ground or a Z correction over 1.5 m leaves Z unchanged and shows a warning. The panel button explains the gesture; placement itself requires the shortcut while hovering the canvas.
- **Adjust direction**, beside Move to mouse (1.9.2), aligns the box's longest horizontal axis with the nearby object's longest horizontal axis, choosing the closest forward/backward facing. It permits at most **30°** correction, preserves dimensions and roll/pitch, then recenters and checks ground at the final orientation. Sparse, symmetric, or unstable axes and corrections over 30° retain the current direction with a warning. The checkbox starts unchecked and remembers its setting independently of Auto-Fit's Keep direction.
- Each placement uses CVAT's native save/history path for the current frame. A track edit follows native keyframe/interpolation behavior. Use normal Undo/Redo and **Save CVAT**.
- **Keyboard shortcuts** records single keys or modifier combinations for tool actions. Clear a binding, reset one, or reset all shortcuts. Escape cancels recording. Duplicate tool bindings are rejected. Browser-reserved combinations may not arrive, and CVAT shortcuts can conflict. Free Cam movement keys remain WASD/QE.
- Settings are stored in `chrome.storage.local` across jobs and browser restarts. The offline demo uses local browser storage and supports direction settings; it has no native top-view placement action.

Automated geometry/adapter/browser verification is recorded in [1.9.0 verification](docs/verification/placement-shortcuts-1.9.0.md). Live top-view and track verification requires an authenticated CVAT session.

The 1.9.1 center-refinement update is covered separately in [mouse refinement verification](docs/verification/mouse-refinement-1.9.1.md).

The optional long-axis direction correction is covered in [1.9.2 verification](docs/verification/mouse-direction-1.9.2.md).

Chọn hoặc tạo box sơ bộ quanh vật thể → **AUTO-FIT BOX** hoặc **Alt+Shift+A**.

1. Đọc trực tiếp buffer THREE.Points với world transform. Index không gian của frame được cache; đổi frame/cloud transform sẽ làm mất hiệu lực cache.
2. Ước lượng ground cục bộ; mở vùng tìm theo kích thước profile class/subtype, thêm biên ROI 0,4 m. Không chỉ tìm trong box sơ bộ nhỏ.
3. Lọc điểm thấp và tách cụm bằng khoảng cách XYZ trên voxel 0,12 m. Điểm sâu trong annotation lân cận (co 0,15 m) bị loại nếu không thuộc vùng box sơ bộ mở rộng 0,4 m.
4. Thử radius 0,55 m trước. Nếu fit bị từ chối do cụm quá lớn/thiếu điểm/phân bố XY, thử 0,4 / 0,3 / 0,25 / 0,2 m. Kết quả sau tách nhỏ phải ổn định qua hai radius liên tiếp (IoU ≥0,9).
5. Tìm hướng qua mặt đứng và minimum-area rectangle/PCA; tính kích thước theo profile. Cụm vượt max quá biên cho phép 0,1 m bị từ chối trước khi ghi. Giữ hướng yaw gần hướng hiện tại vì không nhận biết đầu/đuôi xe.
6. Ground đủ tin cậy (confidence ≥0,65) thì đặt đáy theo điểm ground cao nhất dưới footprint và tính H. Nếu chưa đủ, cho phép fit XY/yaw và giữ Z/H; box có chiều cao vượt profile vẫn có thể bị từ chối.

Cần ít nhất 10 điểm vật thể. Kết quả vẫn cần annotator kiểm tra khi điểm thưa, che khuất, nối cụm hoặc annotation lân cận sai. Việc tách hai radius ổn định không chứng minh cụm thuộc đúng vật thể.

Auto-Fit ghi một lần qua `ObjectState.save()` và Redux/history native, hỗ trợ Undo/Redo. Không REST PATCH annotation.

### Xuất ca thực tế

Sau Auto-Fit, chỉnh tay chính box đó làm mẫu nếu cần, rồi bấm **Export Auto-Fit Case (.json)** trước khi đổi frame hoặc chạy fit khác. Nếu fit thất bại sau khi bắt đầu phân tích, có thể xuất phần dữ liệu đã thu được để chẩn đoán.

JSON gồm seed/fit/current box, subtype/attributes, ROI, ground support, cluster và dữ liệu lựa chọn đã có. Bản hiện tại bổ sung neighborBoxes và các radius đã thử khi lựa chọn thành công. Box hiện tại chỉ là mẫu người dùng cung cấp, không tự được chứng nhận ground truth.

Chỉ giữ ca fit gần nhất trong frame hiện tại; refresh làm mất dữ liệu. File tải về máy, không tự gửi ra ngoài. Chức năng xuất dành cho live editor.

## Ground Snap, quay và Free Cam

- **Ground Snap — Alt+Shift+G:** dịch Z để box chạm mặt phẳng ground; giữ kích thước và góc xoay. Mặt phẳng phải hợp lệ, slope ≤0,25; confidence ≥0,65 hoặc confidence ≥0,45 kèm RMSE ≤0,04 m và ít nhất 60 inliers. UI ghi ground ước lượng khi confidence thấp. Điều kiện thủ công này khác ngưỡng Auto-Fit tự snap.
- Nếu footprint sau fit vẫn nằm trong bán kính ground đã khảo sát, giữ mặt phẳng vừa dùng để Snap không mất kết quả khi tính lại với footprint lớn. Cache mất hiệu lực khi đổi frame/cloud. Live Snap mặc định chặn |ΔZ| >1,5 m.
- **Quay:** Alt+Shift+[ / ] cho −90° / +90°; Alt+Shift+F cho 180°. Sửa yaw qua native save/history.
- **Free Cam — Alt+Shift+C:** WASD/QE, Shift tăng tốc, chuột phải để nhìn; Esc trả orbit. Focus box kết thúc Free Cam.

Tool không cho sửa box khóa, ground truth, workspace review, hoặc khi đang vẽ/kéo. Reference job/frame/revision cũ bị từ chối.

## QC, chọn lỗi và Focus camera

**Alt+Shift+L** chạy QC; chế độ tự cập nhật dùng debounce 140 ms. QC kiểm tra min/max kích thước theo class/subtype, hình học, ground và oriented IoU; hiển thị lý do/mức lỗi và đổi màu theo clientID. Màu QC chỉ thay hiển thị, không sửa màu label task.

- Chọn box trong CVAT/tool: danh sách chỉ hiện lỗi liên quan box đó. Bỏ chọn: hiện lỗi toàn frame.
- Nhấn một dòng lỗi: chọn đúng clientID trong CVAT, đưa camera perspective tới box, chuyển filter mức lỗi về **Tất cả**. Box có ba lỗi vẫn hiện cả ba lỗi.
- Lỗi overlap có nút chọn/Focus box thứ hai; danh sách chuyển theo box được chọn.
- Camera giữ hướng nhìn, đổi tâm và khoảng cách theo kích thước/FOV; hiện chuyển ngay, chưa có animation. Không ghi annotation hoặc thêm history khi chọn/Focus.
- Không truy cập được camera: vẫn chọn box và báo không Focus được. Chọn trực tiếp box vẫn tôn trọng filter mức lỗi hiện tại.

[Thiết kế chọn lỗi và Focus](docs/QC_ISSUE_FOCUS_DESIGN.md). QC là kiểm tra hình học tham khảo, không tự xác nhận class đúng với vật thể. Overlap hỗ trợ upright cuboid có yaw; roll/pitch chưa được hỗ trợ trong phép IoU.

## Build và kiểm thử

Node 24+, cài dependency bằng `pnpm install`. Browser test dùng Edge headless với profile riêng, truy cập demo cục bộ.

```powershell
node --test tests/*.test.cjs
node scripts/build-extension.cjs
node scripts/build-demo.cjs
node node_modules/@playwright/test/cli.js test
```

Chạy demo bằng `node scripts/demo-server.cjs`. Đóng gói bằng `scripts/package-extension.ps1` trong PowerShell có quyền chạy script. Build extension tạo bundle MAIN và ISOLATED riêng, mỗi bundle chứa geometry để tránh lỗi dependency nạp thiếu. Build demo tạo HTML standalone, bundle Three.js và license trong dist.

**Kiểm tra bản 1.8.0:** 64 unit test và17 browser test khác nhau pass (full suite16 và kiểm tra lại5 batch tests sau bổ sung test phím tắt). Bằng chứng tại docs/verification/batch-1.8.0-tests.json. Chưa chạy batch trên CVAT thật.

**Kiểm tra bản 1.6.0 ngày 15/10/2026 (lịch sử):** 49/49 unit test, 8/8 browser test pass; ZIP 1.6.0 khớp source, standalone chứa đúng source hiện tại. Có test subtype từ attributes và fit profile bus/truck, native selection/history mock, Ground Snap sau fit, camera framing, danh sách nhiều lỗi và ROI thật. Chưa nghiệm thu thao tác chọn/sửa/Save/reload trên tab CVAT thật; pass test không bảo đảm Auto-Fit đúng với mọi point cloud.

[Báo cáo audit](docs/verification/tool-audit-2026-10-15.md) ghi nhận trạng thái trước cập nhật tài liệu: phần nhận xét subtype lệch yêu cầu cũ đã được người dùng xác nhận là thay đổi có chủ đích theo công việc thực tế; README này mô tả hành vi hiện hành.

## Bằng chứng và lịch sử

Các báo cáo cũ mô tả thuật toán/profile tại thời điểm tạo, không thay thế cấu hình class/subtype hiện tại:

- [Box32 — xe gần nhau, 1.5.1](docs/verification/autofit-parking-1.5.1.json): 7.283 → 4.304 điểm, box khoảng 4,60 × 1,78 × 1,81 m; chưa có mẫu tay để nghiệm thu.
- [Box17 — ground yếu, 1.4.2](docs/verification/autofit-truck-1.4.2.json): replay giữ Z/H, IoU với mẫu tay 0,862.
- [Box62 — replay 1.4.0](docs/verification/autofit-real-case-1.4.0.json), [Top/Side/Front](docs/verification/autofit-real-case-1.4.0.png): IoU khoảng 0,802; export cũ không có toàn frame raw.
- [Hướng dẫn demo](docs/DEMO_GUIDE.md), [kế hoạch dài hạn](docs/REALTIME_IMPLEMENTATION_PLAN.md).
- [Kiểm chứng README cũ](docs/README_VERIFICATION.md), [README gốc](docs/verification/README.before-verification.md).

Demo dùng dữ liệu mô phỏng; cache Job 9426 có 61 box trong khi lần kiểm tra API/UI lịch sử có 62. Số issue của engine cũ không đại diện cho kết quả QC hiện tại.

## Follow selected object (1.12.0)

Enable **Follow selected object** beside the selected-box controls to keep the perspective orbit centered on the last selected **track** when navigating forward, backward, or jumping frames. Your current orbit angle and distance are preserved; manual rotation and zoom are remembered for the next frame. The checkbox starts unchecked and persists across jobs and browser restarts.

Follow waits for the new frame canvas and rendered track geometry. It pauses for hidden/outside/missing tracks, Free Cam, and canvas interactions; the status beneath the checkbox explains why. Select another track to change the target; selecting a frame-local shape releases it. A job change drops the previous target. Hidden or absent tracks resume when available again. This changes only the perspective camera, creates no annotation edit or keyframe, and requires accessible orbit APIs. The fixed-frame offline demo does not expose this option.

### Free Cam across frames (1.12.1)

Free Cam stays enabled on next/previous/jumped frames within the same job and keeps its world position, viewing direction, and camera zoom through native scene resets or replacement cameras. Frame changes clear held movement/look input; press a movement key again to fly. Escape or the Free Cam toggle exits; changing jobs or disposing the extension also exits and restores native controls.

While Free Cam is active, **Follow selected object** pauses without losing its checkbox preference. Focus selects the box but asks you to exit Free Cam before moving the camera. Native orbit/focus transitions cannot override flight. When flight ends, following resumes on the current track using the flight viewing direction and the previous orbit distance. No annotations or keyframes are changed.

### Noise-resistant Auto Adjust (1.12.2)

Auto Adjust now measures a face from a connected surface patch instead of accepting three nearby returns or a single outermost return. A candidate needs at least six distinct occupied cells, spread in both directions of the face, within a 6 cm boundary band. Local connections are limited to 24 cm. Duplicate returns do not increase confidence. The patch median supplies the boundary estimate; existing 3 cm padding remains.

Small trash clusters, isolated returns and thin noise streaks cannot justify expansion. Faces without a supported patch stay unchanged. A group of uncertain outer returns also prevents inward trimming across a possibly real thin part. Ground exclusion, saved shrink limits, heading preservation, bottom contact, and single-edit behavior remain active. A sufficiently coherent nearby background surface can still resemble an object surface; this is a conservative geometry filter, not semantic object recognition. Review the result in multiple views.
