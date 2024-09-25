document.getElementById('goButton').addEventListener('click', async () => {
  // Get member IDs from the textarea
  const memberIds = document.getElementById('membersInput').value.trim().split('\n').map(id => id.trim());

  // Show the spinner
  document.getElementById('spinner').style.display = 'block';
  document.getElementById('results').textContent = '';

  // Fetch and process the member data
  try {
    const members = await getMembersData(memberIds);
    const similarities = computeSimilarities(members);
    displayResults(similarities);
  } catch (error) {
    console.error(error);
    document.getElementById('results').textContent = 'An error occurred!';
  }

  // Hide the spinner
  document.getElementById('spinner').style.display = 'none';
});

// Function to fetch album ratings for each member directly from the 1001albumsgenerator API
async function getMembersData(memberIds) {
  const members = [];
  for (const id of memberIds) {
    const albumRatings = await getAlbumRatings(id);
    members.push({ id, albumRatings });
  }
  return members;
}

// Function to fetch album ratings via the API (no proxy)
async function getAlbumRatings(memberId) {
  const apiUrl = `https://1001albumsgenerator.com/api/v1/projects/${memberId}`;
  const response = await fetch(apiUrl);

  if (!response.ok) throw new Error(`Failed to fetch data for member ${memberId}`);

  const data = await response.json();

  const albumRatings = {};
  data.history.forEach(item => {
    if (item.album && item.rating) {
      albumRatings[item.album.spotifyId] = item.rating;
    }
  });
  return albumRatings;
}

// Function to compute the Pearson similarity
function computeSimilarities(members) {
  const similarities = {};
  members.forEach(member1 => {
    const scores = {};
    members.forEach(member2 => {
      if (member1.id !== member2.id) {
        const score = computePearsonCorrelation(member1.albumRatings, member2.albumRatings);
        scores[member2.id] = score;
      }
    });
    similarities[member1.id] = scores;
  });
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
