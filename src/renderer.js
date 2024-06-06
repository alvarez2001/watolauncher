function showLoading(message) {
    Swal.fire({
        title: 'Waton espere un momento',
        text: message,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
}

function hideLoading() {
    Swal.close();
}

function launchMinecraft() {
    window.api.launchMinecraft();

    window.api.onLaunchSuccess((message) => {
        document.getElementById('message').textContent = message;
        hideLoading();
    });

    window.api.onLaunchError((error) => {
        document.getElementById('message').textContent = error;
        hideLoading();
    });

    closeWindow();
    showLoading('Launching Minecraft...');
}

function minimizeWindow() {
    window.api.minimizeWindow();
}

function closeWindow() {
    window.api.closeWindow();
}

document.addEventListener('DOMContentLoaded', () => {
    window.api.onLoading((message) => {
        console.log('loading');
        showLoading(message);
    });

    window.api.onLoadingComplete(() => {
        hideLoading();
        document.getElementById('message').textContent = "Ready to use the profile-master.";
    });

    document.getElementById('message').textContent = "Ready to use the profile-master.";
});
