Testing camera behavior (rear/front) on mobile

Notes:

- HTTPS is required by mobile browsers for camera access. When using the local development setup with self-signed certificates, accept the certificate in the browser before granting camera permission.
- Android (Chrome / Chromium-based browsers): device labels and multiple cameras are usually exposed. The scanner will prefer cameras whose label includes "back", "rear", or "environment". Use the drop-down to explicitly choose another camera if needed.
- iOS (Safari): due to platform privacy, device labels and deviceIds may be unavailable; Safari often doesn't list multiple devices via the standard API. To request the rear camera on iOS, the app must request getUserMedia with `facingMode: { exact: "environment" }` or `ideal: "environment"`. The current implementation prefers a labeled rear camera; if that is not available on a particular iOS version, consider the facingMode fallback described below.

Facing mode fallback:

- If some browsers (notably older iOS Safari) do not provide camera labels or multiple device IDs, the `facingMode` constraint can be used as a fallback to try to select the rear camera:

  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })

- Implementing a facingMode fallback is optional but recommended for better iOS compatibility. It requires modifying the scanner start logic to attempt a getUserMedia call with the `facingMode` constraint when Html5Qrcode's camera list can't pick an environment camera.

Permissions and troubleshooting:

- Ensure the page is served over HTTPS; otherwise the browser will block camera access.
- If the camera preview stays black on mobile, try closing other apps that use the camera and reload the page.
- If using Chrome on Android and the rear camera is still not selected, choose another camera from the selector added to the UI.

