// Function to parse URL parameters
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// Setup on page load
document.addEventListener('DOMContentLoaded', () => {
  const groupFromUrl = getQueryParam('group');

  if (groupFromUrl) {
    // Set this value into the input field
    document.getElementById('groupNameInput').value = groupFromUrl;

    // Automatically populate the input and show results
    fetchAndDisplayResults(groupFromUrl);
  }
});

document.getElementById('goButton').addEventListener('click', async () => {
  // Get group name from the input field
  const groupName = document.getElementById('groupNameInput').value.trim();

  fetchAndDisplayResults(groupName);
});

// Function to show the spinner and hide the results block
function showSpinnerAndPrepareUI() {
  document.getElementById('spinner').classList.remove("hidden");
  document.getElementById('results-block').classList.add("hidden");
  document.getElementById('results').textContent = '';
}

// Function to hide the spinner and show the results block
function hideSpinnerAndShowResults() {
  document.getElementById('spinner').classList.add("hidden");
  document.getElementById('results-block').classList.remove("hidden");
}

// Function to handle "Go" button click or auto-trigger from URL parameter
function fetchAndDisplayResults(groupName) {
  if (!groupName) {
    alert('Please enter a group name.');
    return;
  }

  // Step 1: Show the spinner and prepare the UI
  showSpinnerAndPrepareUI();

  // Step 2: Use setTimeout to defer fetching to the next event loop iteration
  setTimeout(async () => {
    // Step 3: Fetch and process the data after the spinner is shown
    await fetchAndProcessData(groupName);

    // Step 4: Hide the spinner and show the results block
    hideSpinnerAndShowResults();
  }, 1); // Ensures the fetch happens after the UI has had a chance to update
}

// Function to fetch and process the data
async function fetchAndProcessData(groupName) {
  try {
    const members = await getGroupMembers(groupName); // Fetch members
    const similarities = await computeSimilarities(members); // Compute similarities
    displayResults(similarities); // Display results
  } catch (error) {
    console.error(error);
    document.getElementById('results').textContent = 'An error occurred!';
  }
}

function displayStatus(status) {
  document.getElementById('statusMessage').textContent = status;
}

// Function to fetch group members via the API and return only the "members" key
async function getGroupMembers(groupName) {
  displayStatus('Fetching group members...');

  const apiUrl = `https://1001albumsgenerator.com/api/v1/groups/${groupName}`;

  const response = await fetchWithRetry(apiUrl, 9);

  // Return the "members" key from the response object
  return response.members;
}

// Function to fetch album ratings from a local JSON file or an API
async function getAlbumRatings(memberId) {
  const localFileUrl = `sample_data/${memberId}.json`;  // Relative path to JSON file

  try {
    // Try to fetch the file from the local directory (relative path)
    // const response = await fetch(localFileUrl);

    // if (response.ok) {
    //   // If the file is found, parse and return the JSON data
    //   const jsonData = await response.json();
    //   return extractAlbumRatings(jsonData);
    // } else {
    // If the file doesn't exist, fall back to fetching from the API
    const apiUrl = `https://1001albumsgenerator.com/api/v1/projects/${memberId}`;
    const apiResponse = await fetchWithRetry(apiUrl, 5);
    return extractAlbumRatings(apiResponse);
    // }
  } catch (error) {
    console.error('Error fetching album ratings:', error);
  }
}

// Function to extract album ratings from the response or file data
function extractAlbumRatings(data) {
  const history = data.history;
  const albumRatings = {};

  history.forEach(item => {
    if (item.album && item.album.spotifyId && item.rating !== undefined) {
      albumRatings[item.album.spotifyId] = item.rating;
    }
  });

  return albumRatings;
}

// Function to retry requests with exponential backoff
async function fetchWithRetry(url, maxRetries) {
  let attempt = 0;
  const delay = ms => new Promise(res => setTimeout(res, ms));

  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // API key for the 1001 Albums Generator API, allows 1 request per second.
          'x-api-access': '4ansehnyaMjwnfozhmalksqkpKncaeeMekdCzcKnNmAaJabsuRe4jkdlAa8mannn'
        }
      });
      if (response.ok) {
        console.log(`Request successful for URL: ${url}.  Response: ${response.status} ${response.body}`);
        return await response.json();
      } else if (response.status === 429) {
        // Too Many Requests, backoff and retry
        attempt++;
        const backoffDelay = Math.pow(2, attempt) * 100; // Exponential backoff
        console.log(`Attempt ${attempt}: Waiting ${backoffDelay}ms before retrying...`);
        await delay(backoffDelay);
      } else {
        throw new Error(`Request failed with status: ${response.status}`);
      }
    } catch (error) {
      if (attempt === maxRetries) {
        throw new Error(`Max retries reached for URL: ${url}`);
      }
      attempt++;
      const backoffDelay = Math.pow(2, attempt) * 100;
      console.log(`Attempt ${attempt}: Waiting ${backoffDelay}ms before retrying...`);
      await delay(backoffDelay);
    }
  }

  throw new Error(`Max retries reached for URL: ${url}`);
}

// Function to compute the Pearson similarity between all group members
async function computeSimilarities(members) {
  const memberData = [];

  for (const member of members) {
    displayStatus(`Fetching album ratings for ${member.name}...`);
    const albumRatings = await getAlbumRatings(member.id);
    memberData.push({
      name: member.name,
      albumRatings
    });
  }

  // Only look at members who have rated at least one album with a real rating (not "did not rate").
  const filteredMemberData = memberData.map(member => {
    const validAlbumRatings = Object.fromEntries(
      Object.entries(member.albumRatings).filter(([albumId, rating]) => {
        return typeof rating === 'number';
      })
    );

    return { ...member, albumRatings: validAlbumRatings };
  }).filter(member => Object.keys(member.albumRatings).length > 0);

  const similarities = {};
  for (const member1 of filteredMemberData) {
    const scores = {};
    for (const member2 of filteredMemberData) {
      if (member1.name !== member2.name) {
        const score = computePearsonCorrelation(member1.albumRatings, member2.albumRatings);
        scores[member2.name] = score;
      }
    }
    similarities[member1.name] = scores;
  }
  return similarities;
}

// Function to compute Pearson correlation between two members' album ratings
function computePearsonCorrelation(ratings1, ratings2) {
  const commonAlbums = Object.keys(ratings1).filter(albumId => {
    return (
      albumId in ratings2 &&
      typeof ratings1[albumId] === 'number' &&
      typeof ratings2[albumId] === 'number'
    );
  });

  if (commonAlbums.length === 0) return 0; // No common albums

  const ratings1Values = commonAlbums.map(albumId => ratings1[albumId]);
  const ratings2Values = commonAlbums.map(albumId => ratings2[albumId]);

  const mean1 = average(ratings1Values);
  const mean2 = average(ratings2Values);

  const numerator = commonAlbums.reduce((acc, albumId, idx) =>
    acc + (ratings1Values[idx] - mean1) * (ratings2Values[idx] - mean2), 0);
  const denominator = Math.sqrt(
    commonAlbums.reduce((acc, _, idx) => acc + Math.pow(ratings1Values[idx] - mean1, 2), 0) *
    commonAlbums.reduce((acc, _, idx) => acc + Math.pow(ratings2Values[idx] - mean2, 2), 0)
  );
  return denominator === 0 ? 0 : numerator / denominator;
}

// Utility function to compute average
function average(arr) {
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

// Function to display results in a 2D table with dynamic color coding, skipping self-comparisons
function displayResults(similarities) {
  const resultsDiv = document.getElementById('results');
  const members = Object.keys(similarities);

  // Create the table structure
  let table = "<table class='text-left'><thead><tr><th></th>";

  // Create the table header (members as columns)
  members.forEach(member => {
    table += `<th class="p-2">${member}</th>`;
  });
  table += '</tr></thead><tbody>';

  // Create the table body
  members.forEach(member1 => {
    table += `<tr><th class="p-2">${member1}</th>`;  // Row header
    members.forEach(member2 => {
      if (member1 === member2) {
        // Skip color and value for self-comparison (diagonal cells)
        table += `<td></td>`;
      } else {
        const score = similarities[member1][member2].toFixed(2); // Pearson value
        const color = getDynamicColor(score); // Compute dynamic color
        table += `<td class="p-2" style="background-color:${color}; color: black};">${score}</td>`;
      }
    });
    table += '</tr>';
  });

  table += '</tbody></table>';
  resultsDiv.innerHTML = table;
}

// Function to compute dynamic color based on Pearson score
function getDynamicColor(score) {
  // Normalize score to a range between -1 and 1
  const normalizedScore = Math.max(-1, Math.min(1, parseFloat(score)));

  // RGB components for max inverse correlation (-1.0) -> #C44536
  const red1 = 196, green1 = 69, blue1 = 54;

  // RGB components for max correlation (1.0) -> #95BF74
  const red2 = 149, green2 = 191, blue2 = 116;

  // If score is positive, interpolate between white and green (#255957)
  if (normalizedScore > 0) {
    const red = Math.round(255 + (red2 - 255) * normalizedScore);     // Interpolate red
    const green = Math.round(255 + (green2 - 255) * normalizedScore); // Interpolate green
    const blue = Math.round(255 + (blue2 - 255) * normalizedScore);   // Interpolate blue
    return `rgb(${red}, ${green}, ${blue})`;
  }

  // If score is negative, interpolate between white and red (#88292F)
  if (normalizedScore < 0) {
    const red = Math.round(255 + (red1 - 255) * Math.abs(normalizedScore));   // Interpolate red
    const green = Math.round(255 + (green1 - 255) * Math.abs(normalizedScore)); // Interpolate green
    const blue = Math.round(255 + (blue1 - 255) * Math.abs(normalizedScore)); // Interpolate blue
    return `rgb(${red}, ${green}, ${blue})`;
  }

  // If score is 0, return white
  return `rgb(255, 255, 255)`;
}
