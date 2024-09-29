document.getElementById('goButton').addEventListener('click', async () => {
  // Get group name from the input field
  const groupName = document.getElementById('groupNameInput').value.trim();

  if (!groupName) {
    alert('Please enter a group name.');
    return;
  }

  // Show the spinner
  document.getElementById('spinner').style.display = 'block';
  document.getElementById('results').textContent = '';

  // Fetch and process the group data
  try {
    const members = await getGroupMembers(groupName);
    const similarities = await computeSimilarities(members);
    displayResults(similarities);
  } catch (error) {
    console.error(error);
    document.getElementById('results').textContent = 'An error occurred!';
  }

  // Hide the spinner
  document.getElementById('spinner').style.display = 'none';
});

// Function to fetch group members via the API and return only the "members" key
async function getGroupMembers(groupName) {
  const apiUrl = `https://1001albumsgenerator.com/api/v1/groups/${groupName}`;

  const response = await fetchWithRetry(apiUrl, 5);

  // Return the "members" key from the response object
  return response.members;
}

// Function to fetch album ratings for each member
async function getAlbumRatings(memberId) {
  const apiUrl = `https://1001albumsgenerator.com/api/v1/projects/${memberId}`;

  // Fetch the data using the fetchWithRetry function
  const response = await fetchWithRetry(apiUrl, 5);

  console.log(response);

  // Extract the "history" key from the response
  const history = response.history;

  // Create an object to store album ratings using the album's spotifyId as the key
  const albumRatings = {};

  history.forEach(item => {
    // Ensure album and rating exist in the response item
    if (item.album && item.album.spotifyId && item.rating !== undefined) {
      albumRatings[item.album.spotifyId] = item.rating;
    }
  });

  // Return the albumRatings object
  return albumRatings;
}

// Function to retry requests with exponential backoff
async function fetchWithRetry(url, maxRetries) {
  let attempt = 0;
  const delay = ms => new Promise(res => setTimeout(res, ms));

  while (attempt < maxRetries) {
    try {
      const response = await fetch(url);
      if (response.ok) {
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
}

// Function to compute the Pearson similarity between all group members
async function computeSimilarities(members) {
  const memberData = [];

  for (const member of members) {
    const albumRatings = await getAlbumRatings(member.id);
    memberData.push({
      name: member.name,
      albumRatings
    });
  }

  const similarities = {};
  for (const member1 of memberData) {
    const scores = {};
    for (const member2 of memberData) {
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
  const commonAlbums = Object.keys(ratings1).filter(albumId => ratings2.hasOwnProperty(albumId));
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

// Function to display the results
function displayResults(similarities) {
  const resultElement = document.getElementById('results');
  resultElement.textContent = JSON.stringify(similarities, null, 2);
}
