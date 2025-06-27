let collectedSymptoms = [];
let symptomCollectionActive = true;
let waitingForDays = false;

document.addEventListener("DOMContentLoaded", async function () {
    const userName = await getUserName(); // Fetch username from backend
    displayMessage(`🤖 Hello ${userName}! I'm your Health Assistant. Please enter your symptom or u can ask queries!.\nPlease ensure that while entering symptoms instead of space use underscore.`);

    document.getElementById("userInput").addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            startSymptomCollection();
        }
    });
    document.getElementById("download-container").style.display = "none"; // Initially hide download options
});




// Function to get the logged-in user's name from the backend

async function getUserName() {
    try {
        const response = await fetch("http://127.0.0.1:5000/get_username"); // Adjust the endpoint as per your backend
        const data = await response.json();
        return data.username || "User"; // Default to "User" if no name is found
    } catch (error) {
        console.error("Error fetching username:", error);
        return "User";
    }
}


let waitingForMedicalQueries = false;

let postDiagnosisQueryMode = false; // ✅ New flag for allowing LLM queries after diagnosis

async function startSymptomCollection() {
    const inputField = document.getElementById("userInput");
    let userInput = inputField.value.trim().toLowerCase(); // Convert input to lowercase
    inputField.value = ""; // Clear input field

    if (userInput === "") {
        displayMessage("⚠️ Please enter a symptom, a query, or type 'exit' to finish.");
        inputField.focus();
        return;
    }

    // ✅ Allow medical queries AFTER diagnosis
    if (postDiagnosisQueryMode) {
        await getMedicalExplanation(userInput);
        return;
    }

    // ✅ Handle medical queries before diagnosis
    if (waitingForMedicalQueries) {
        if (userInput === "no") {
            waitingForMedicalQueries = false;

            if (collectedSymptoms.length < 5) {
                symptomCollectionActive = true;
                displayMessage("✅ Please enter your symptom.");
            } else {
                waitingForDays = true;
                displayMessage("🕒 You've entered enough symptoms. How many days have you experienced them?");
            }
            inputField.focus();
            return;
        }

        await getMedicalExplanation(userInput);
        return;
    }

    // ✅ If the chatbot is waiting for "days" input
    if (waitingForDays) {
        let days = parseInt(userInput);
        if (isNaN(days) || days <= 0) {
            displayMessage("⚠️ Please enter a valid number of days.");
        } else {
            waitingForDays = false;
            await predictDisease(days);

            // ✅ Enable post-diagnosis queries after getting results
            postDiagnosisQueryMode = true;
            displayMessage("🤖 You can also now ask me general health-related queries!");
        }
        inputField.focus();
        return;
    }

    // ✅ Stop collecting symptoms when "exit" is entered
    if (symptomCollectionActive) {
        if (userInput === "exit") {
            symptomCollectionActive = false;
            waitingForDays = true;
            displayMessage("🕒 How many days have you experienced these symptoms?");
            return;
        }

        if (userInput === "edit") {
            editSymptoms();
            return;
        }

        // ✅ Check if the user is asking about a symptom
        if (/^(hi|hello|hat is|explain|tell me about)\b/i.test(userInput) || userInput.split(" ").length > 2) {  //Main working model
            waitingForMedicalQueries = true;
            await getMedicalExplanation(userInput);
            return;
        }

        // ✅ Collect symptoms
        await collectSymptoms(userInput);

        // ✅ If 5 symptoms are collected, move to days input
        if (collectedSymptoms.length >= 5) {
            symptomCollectionActive = false;
            waitingForDays = true;
            displayMessage("🕒 You've entered 5 symptoms. How many days have you experienced them?");
            return;
        }
    } else {
        displayMessage("⚠️ Symptom collection is complete. Please enter the number of days.");
    }

    inputField.focus(); // Ensure input field stays active
}



async function collectSymptoms(symptom) {                         // Main working method
    symptom = symptom.toLowerCase().trim(); // Normalize input

    if (symptom === "edit") {
        editSymptoms();
        return;
    }

    // ✅ Check if the symptom is already collected
    if (collectedSymptoms.includes(symptom)) {
        displayMessage(`⚠️ You've already entered "${symptom}". Try a different symptom.`);
        return;
    }

    try {
        const response = await fetch("/collect_symptoms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symptom, collected_symptoms: collectedSymptoms })
        });

        const data = await response.json();

        // ✅ Handle invalid symptoms and provide suggestions
       if (data.invalid_symptom) {
            if (data.suggestions.length > 0) {
                displayMessage(`❌ "${data.invalid_symptom}" is not in the dataset. Did you mean: ` +
                    data.suggestions
                        .filter(sym => !collectedSymptoms.includes(sym)) // ✅ Show only uncollected suggestions
                        .map(sym =>
                            `<button onclick="collectSymptoms('${sym}')" style="margin:5px; padding:5px; cursor:pointer;">${sym}</button>`
                        ).join(" "));
            } else {
                // ✅ No suggestions available, print custom message
                displayMessage(`❌ "${data.invalid_symptom}" is not in the dataset. Try another symptom.`);
            }
            return;
        }

        // ✅ Add symptom only if it's valid and unique
        collectedSymptoms.push(symptom);
        displayMessage(`✅ Collected Symptoms: ${collectedSymptoms.join(", ")}`);

        // ✅ If 5 symptoms are collected, move to days input
        if (collectedSymptoms.length >= 5) {
            symptomCollectionActive = false;
            waitingForDays = true;
            displayMessage("🕒 You've entered 5 symptoms. How many days have you experienced them?");
            return;
        }

        // ✅ Show only uncollected related symptoms
        let uncollectedRelatedSymptoms = data.related_symptoms.filter(sym => !collectedSymptoms.includes(sym));

        if (uncollectedRelatedSymptoms.length > 0) {
            displayMessage(`💡 Related symptoms: ` +
                uncollectedRelatedSymptoms.map(sym =>
                    `<button onclick="collectSymptoms('${sym}')" style="margin:5px; padding:5px; cursor:pointer;">${sym}</button>`
                ).join(" ") + ` (Type 'edit' to modify symptoms or type 'exit' to finish)`);
        } else {
            displayMessage("ℹ️ No new related symptoms found. Try entering another symptom.");
        }

    } catch (error) {
        console.error("Error collecting symptoms:", error);
        displayMessage("⚠️ An error occurred while collecting symptoms. Please try again.");
    }
}



function editSymptoms() {
    if (collectedSymptoms.length === 0) {
        displayMessage("⚠️ No symptoms to edit.");
        return;
    }

    let editMessage = collectedSymptoms
        .map((sym, index) => `<button onclick="removeSymptom(${index})" style="margin:5px; padding:5px; cursor:pointer;">❌ ${sym}</button>`)
        .join(" ");

    displayMessage(`📝 Click to remove a symptom: ${editMessage}`);
}

function removeSymptom(index) {
    collectedSymptoms.splice(index, 1);
    displayMessage(`🗑️ Removed symptom. Current symptoms: ${collectedSymptoms.join(", ")}`);

    // ✅ Restart symptom collection if all symptoms are removed
    if (collectedSymptoms.length === 0) {
        symptomCollectionActive = true;
        waitingForDays = false;
        displayMessage("✅ You have removed all symptoms. Please enter a new symptom.");
    }
   if (collectedSymptoms.length < 5) {
        symptomCollectionActive = true;
        waitingForDays = false;
    }
    // ✅ Focus input field for next symptom entry
    document.getElementById("userInput").focus();
}


async function predictDisease(days) {
    try {
        displayMessage("🔎 Diagnosing based on your symptoms...");

        const response = await fetch("http://127.0.0.1:5000/predict_disease", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symptoms: collectedSymptoms, days })
        });

        const data = await response.json();

        let diagnosisMessage = `
            🔹 <strong>Primary Disease:</strong> ${data.primary_disease} <br><br>
            📝 <strong>Description:</strong> ${data.primary_description} <br><br>
            💊 <strong>Precautions:</strong> <br>
            <ul>${data.primary_precautions.map(p => `<li>${p}</li>`).join("")}</ul><br><br>

            🔸 <strong>Secondary Disease:</strong> ${data.secondary_disease} <br><br>
            📝 <strong>Description:</strong> ${data.secondary_description} <br><br>
            💊 <strong>Precautions:</strong> <br>
            <ul>${data.secondary_precautions.map(p => `<li>${p}</li>`).join("")}</ul><br><br>

            ${data.recommend_doctor ? "🚨 <strong>Consult a doctor immediately!</strong>" : "✅ Follow precautions and monitor symptoms."}
        `;

        displayMessage(diagnosisMessage);

        // Show the download container with the close button
        const downloadContainer = document.getElementById("download-container");
        downloadContainer.style.display = "flex";
        document.getElementById("download-report").dataset.reportData = JSON.stringify(data);

    } catch (error) {
        console.error("Error predicting disease:", error);
    }
}

function downloadReport() {
    const confirmDownload = confirm("📄 Do you want to download the report?");
    if (!confirmDownload) return;

    const data = JSON.parse(document.getElementById("download-report").dataset.reportData);

    let reportContent = `
Health Diagnosis Report
-----------------------

Primary Disease: ${data.primary_disease}

Description:
${data.primary_description}

Precautions:
${data.primary_precautions.map(p => `- ${p}`).join("\n")}

------------------------------------

Secondary Disease: ${data.secondary_disease}

Description:
${data.secondary_description}

Precautions:
${data.secondary_precautions.map(p => `- ${p}`).join("\n")}

${data.recommend_doctor ? "\n🚨 Consult a doctor immediately!\n" : "\n✅ Follow precautions and monitor symptoms.\n"}`;

    const blob = new Blob([reportContent], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Health_Diagnosis_Report.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function hideDownloadOption() {
    document.getElementById("download-container").style.display = "none";
}

function displayMessage(message) {
    const chatbox = document.getElementById("messages");
    let msgElement = document.createElement("p");
    msgElement.innerHTML = message;
    // msgElement.style.textAlign='right'
    chatbox.appendChild(msgElement);
    chatbox.scrollTop = chatbox.scrollHeight;
}

document.getElementById("clear-chat").addEventListener("click", clearChat);


async function clearChat() {
    document.getElementById("messages").innerHTML = ""; // ✅ Clear chat screen only

    // ✅ Keep the session active without resetting collected symptoms
    displayMessage("✅ Chat cleared. You can continue from where you left off.");
}


//Dark-light mode toggle function

document.addEventListener("DOMContentLoaded", function () {
    const darkModeToggle = document.getElementById("dark-mode-toggle");
    const body = document.body;
    const chatContainer = document.querySelector(".chatbox");

    // Check saved preference and apply dark mode
    if (localStorage.getItem("darkMode") === "enabled") {
        body.classList.add("dark-mode");
        chatContainer.classList.add("dark-mode");
    }

    // Toggle dark mode
    darkModeToggle.addEventListener("click", function () {
        body.classList.toggle("dark-mode");
        chatContainer.classList.toggle("dark-mode");

        // Save preference
        if (body.classList.contains("dark-mode")) {
            localStorage.setItem("darkMode", "enabled");
        } else {
            localStorage.setItem("darkMode", "disabled");
        }
    });
});

//---------------------------------------------------------------------------------------------------/////////////////////


// logout

document.getElementById("logout-btn").addEventListener("click", function() {
        window.location.href = "/logout"; // Redirect to logout route
    });

//chat-history
async function loadChatHistory() {
    try {
        const response = await fetch("/get_chat_history");
        const data = await response.json();
        const chatHistoryContainer = document.getElementById("chat-history");

        chatHistoryContainer.innerHTML = ""; // Clear old chat list

        data.chat_history.forEach(chat => {
            let listItem = document.createElement("li");
            listItem.innerHTML = `
                <div>
                    <strong>Symptoms:</strong> ${chat.user_message} <br>
                    <strong>Primary Disease:</strong> ${chat.primary_disease} <br>
                    <strong>Secondary Disease:</strong> ${chat.secondary_disease}
                </div>
                <button class="delete-btn" onclick="deleteChat('${chat.id}')">🗑️</button>
            `;
            listItem.dataset.chatId = chat.id;

            listItem.addEventListener("click", function () {
                loadSpecificChat(chat.id);
            });

            chatHistoryContainer.appendChild(listItem);
        });

    } catch (error) {
        console.error("Error loading chat history:", error);
    }
}


// Call function when page loads
document.addEventListener("DOMContentLoaded", loadChatHistory);



document.addEventListener("DOMContentLoaded", async function () {
    await loadChatHistory();
    document.getElementById("new-chat").addEventListener("click", startNewChat);
});


async function startNewChat() {
    try {
        const response = await fetch("/new_chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        const data = await response.json();
        if (data.new_session) {
            // ✅ Store the new session ID in sessionStorage
            sessionStorage.setItem("session_id", data.session_id);

            // ✅ Reset chatbot progress for a fresh start
            collectedSymptoms = [];
            symptomCollectionActive = true;
            waitingForDays = false;
            waitingForMedicalQueries = false;
            postDiagnosisQueryMode = false;

            // ✅ Clear the chat window
            document.getElementById("messages").innerHTML = "";

            // ✅ Fetch username and display new session message
            const userName = await getUserName();
            displayMessage(`🤖 Hello ${userName}! New chat session started. Please enter your first symptom.`);

            // ✅ Hide the download container if visible
            document.getElementById("download-container").style.display = "none";

            // ✅ Reload chat history to reflect changes
            await loadChatHistory();
        }
    } catch (error) {
        console.error("Error starting a new chat session:", error);
    }
}

// Attach event listener for "New Chat" button
document.getElementById("new-chat").addEventListener("click", startNewChat);


async function deleteChat(chatId) {
    try {
        const response = await fetch("/delete_chat", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId })
        });

        const data = await response.json();
        if (data.message) {
            alert("Chat deleted successfully!");
            await loadChatHistory();
        } else {
            alert("Error deleting chat.");
        }
    } catch (error) {
        console.error("Error deleting chat:", error);
    }
}


async function loadSpecificChat(chatId) {
    try {
        const response = await fetch(`/get_chat_details?chat_id=${chatId}`);
        const chat = await response.json();

        if (!chat) {
            console.error("Chat not found.");
            return;
        }

        document.getElementById("messages").innerHTML = `
            <strong>🧑‍⚕️ You:</strong> ${chat.user_message} <br>
            <strong>🤖 Bot:</strong> ${chat.bot_response} <br><br>

            🔹 <strong>Primary Disease:</strong> ${chat.primary_disease} <br>
            📝 <strong>Description:</strong> ${chat.primary_description} <br>
            💊 <strong>Precautions:</strong> <ul>${chat.primary_precautions.map(p => `<li>${p}</li>`).join("")}</ul><br>

            🔸 <strong>Secondary Disease:</strong> ${chat.secondary_disease} <br>
            📝 <strong>Description:</strong> ${chat.secondary_description} <br>
            💊 <strong>Precautions:</strong> <ul>${chat.secondary_precautions.map(p => `<li>${p}</li>`).join("")}</ul><br>
        `;
    } catch (error) {
        console.error("Error loading specific chat:", error);
    }
}


// ------------------LLM-------------------------------------------//

// ✅ New Function: Get Medical Explanation (Using Groq)
async function getMedicalExplanation(query) {

     const userInput = document.getElementById("userInput").value.trim();
    displayMessage(query, "user");

    try {
        const response = await fetch("/ask_medical", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query })
        });

        const data = await response.json();
        displayMessage(`🤖 ${data.response}`);

        // ✅ If it's before diagnosis, ask if the user has more queries
        if (!postDiagnosisQueryMode) {
            setTimeout(() => {
                displayMessage("❓ Do you have any other medical queries? Type them below or say 'no' to continue.");
            }, 1000);
        }

    } catch (error) {
        console.error("Error fetching medical explanation:", error);
        displayMessage("⚠️ Unable to fetch medical explanation at the moment.");
    }
}

function displayMessage(message, sender = "bot") {
    const chatbox = document.getElementById("messages");
    let msgElement = document.createElement("div");

    msgElement.classList.add("message-bubble"); // Common bubble class

    if (sender === "user") {
        msgElement.classList.add("user-message");  // ✅ Align user messages to the right
    } else {
        msgElement.classList.add("bot-message");   // ✅ Align bot messages to the left
    }

    msgElement.innerHTML = message;
    chatbox.appendChild(msgElement);
    chatbox.scrollTop = chatbox.scrollHeight;
}

