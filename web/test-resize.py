from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)  # Non-headless for debugging
    page = browser.new_page()

    # Setup console logging
    def log_console(msg):
        print(f"[BROWSER {msg.type}] {msg.text}")

    page.on('console', log_console)

    # Navigate to the app
    page.goto('http://localhost:5173')
    page.wait_for_load_state('networkidle')

    # Since we can't login easily, let's just check if the HTML/CSS are correct
    # by navigating directly if already logged in
    page.goto('http://localhost:5173/documents/1')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)

    print(f"Current URL: {page.url}")

    # Get the resizer element info
    resizer = page.locator('.resizer').first
    if resizer.count() > 0:
        box = resizer.bounding_box()
        print(f"Resizer box: {box}")

        if box:
            # Calculate center of resizer
            center_x = box['x'] + box['width'] / 2
            center_y = box['y'] + box['height'] / 2
            print(f"Resizer center: ({center_x}, {center_y})")

            # Try to click on the resizer
            page.mouse.move(center_x, center_y)
            page.wait_for_timeout(200)

            # Try mousedown
            page.mouse.down()
            page.wait_for_timeout(100)

            # Check if body has is-resizing class
            has_class = page.evaluate('document.body.classList.contains("is-resizing")')
            print(f"Body has is-resizing class after mousedown: {has_class}")

            # Move mouse
            page.mouse.move(center_x + 50, center_y)
            page.wait_for_timeout(100)

            # Check again
            has_class = page.evaluate('document.body.classList.contains("is-resizing")')
            print(f"Body has is-resizing class after mousemove: {has_class}")

            # Release
            page.mouse.up()
            page.wait_for_timeout(100)

            has_class = page.evaluate('document.body.classList.contains("is-resizing")')
            print(f"Body has is-resizing class after mouseup: {has_class}")

    else:
        print("No resizer found on page")

    page.screenshot(path='/tmp/resize-test.png')
    print("Screenshot saved")

    browser.close()
