let container = document.getElementById("container");

// Toggle between sign-in and sign-up views
const toggle = () => {
  container.classList.toggle("sign-in");
  container.classList.toggle("sign-up");
};

// Set default view after 200ms
setTimeout(() => {
  container.classList.add("sign-in");
}, 200);

function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
}

if (localStorage.getItem("darkMode") === "true") {
  document.body.classList.add("dark-mode");
}

async function handleSignUp() {
  const button = document.querySelector(".sign-up button");
  button.disabled = true;

  const username = document.getElementById("signup-username").value.trim();
  const email = document.getElementById("signup-email").value.trim().toLowerCase();
  const password = document.getElementById("signup-password").value;
  const confirmPassword = document.getElementById("signup-confirm-password").value;

  if (!username || !email || !password || !confirmPassword) {
    alert("Please fill in all fields!");
    button.disabled = false;
    return;
  }

  if (password.length < 6) {
    alert("Password must be at least 6 characters long.");
    button.disabled = false;
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match!");
    button.disabled = false;
    return;
  }

  try {
    const response = await fetch("/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await response.json();
    alert(data.message);

    if (response.ok) {
      toggle(); // Switch to sign-in view automatically
      document.getElementById("signup-form").reset(); // Clear form after signup
    }
  } catch (error) {
    console.error("Carry on!!!:", error);
    alert("Carry on!!!.");
  }

  button.disabled = false;
}

async function handleSignIn() {
  const email = document.getElementById("signin-email").value.trim().toLowerCase();
  const password = document.getElementById("signin-password").value;

  if (!email || !password) {
    alert("Please enter your email and password.");
    return;
  }

  try {
    const response = await fetch("/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      alert("Sign-in successful!");
      window.location.href = "/chatbot"; // Redirect to chatbot page
    } else {
      alert(data.message);
    }
  } catch (error) {
    console.error("Error during sign-in:", error);
    alert("An error occurred during sign-in.");
  }
}


//=====================================no more changes=============================================================//