// Using native fetch in Node 18+

const apiKey = 'AIzaSyCnvo_XFPmAabrDkOKBRpbivp5UH8r_3mg';
const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
const proxiedUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(authUrl)}`;

async function testAuthWithCodetabs() {
    console.log("Testing Firebase anonymous signUp via Codetabs proxy...");
    try {
        const response = await fetch(proxiedUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ returnSecureToken: true })
        });
        const text = await response.text();
        console.log("Response status:", response.status);
        console.log("Response text:", text);
    } catch (e) {
        console.error("Error:", e);
    }
}

testAuthWithCodetabs();
