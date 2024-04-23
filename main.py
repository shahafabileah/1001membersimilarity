# This script computes a person-to-person similarity score for members of a group on 1001albumsgenerator.com.
# It relies on this API: https://www.reddit.com/r/1001AlbumsGenerator/comments/p6xw6y/json_api/

import requests
import numpy as np
import time
import hashlib
import json

def main():
  members = get_members('sportsball-2-electric-boogaloo')

  for member in members:
    member['album_ratings'] = get_album_ratings(member['id'])

  for member1 in members:
    similarities = {}

    for member2 in members:
      if member1 == member2:
        continue

      score = compute_similarity(member1['album_ratings'], member2['album_ratings'])
      similarities[member2['name']] = score
    
    # Sort the similarities by score
    sorted_similarities = sorted(similarities.items(), key=lambda x: x[1], reverse=True)
    print(f"{member1['name']}:")
    for name, score in sorted_similarities:
      print(f"  {score:.2f} similar to {name}")

def get_members(group_id):
  # Ideally we'd get the members from the group request:
  # https://1001albumsgenerator.com/api/v1/groups/sportsball-2-electric-boogaloo
  # But for now that response doesn't list the members and their IDs.
  return [
    { 'name': 'atrox', 'id': '651f4b728a53974fd9ab540d' },
    { 'name': 'ambikas-take', 'id': '651f4c6e8a53974fd9ab55e3' },
    { 'name': 'the-general', 'id': '651f4ceb8a53974fd9ab569c' },
    { 'name': 'shahaf', 'id': '651f59418a53974fd9ab677b' },
    { 'name': 'wicked-lobsta', 'id': '651f4df38a53974fd9ab5815' },
    { 'name': 'wacygravy', 'id': '652723be3fa9e477771f022a' },
  ]

def get_album_ratings(member_id):
  album_ratings = {}

  data = do_request("https://1001albumsgenerator.com/api/v1/projects/" + member_id)
  for item in data['history']:
    album_id = item['album']['spotifyId']
    if 'rating' in item:
      album_ratings[album_id] = item['rating']

  return album_ratings

def do_request(url):
  # Try to get the data from cache if available (workaround for rate limit)

  # Get a hash for the URL
  hash = hashlib.md5(url.encode()).hexdigest()

  # Try to read the data from the cache in /tmp
  try:
    with open(f'/tmp/{hash}.json', 'r') as file:
      # JSON parse
      return json.load(file)
  except FileNotFoundError:
    pass

  attempt = 1
  while attempt <= 3:
    response = requests.get(url)
    if response.status_code == 200:
      # Write the data to the cache
      with open(f'/tmp/{hash}.json', 'w') as file:
        file.write(response.text)

      return response.json()
    else:
      # We probably hit a rate limit, so wait and try again.
      attempt += 1
      time.sleep(attempt)
  
  raise Exception(f"Failed to get data from {url}")

def compute_similarity(user1_data, user2_data):
  user1_ratings = []
  user2_ratings = []

  for album_id in user1_data.keys():
    if album_id in user2_data.keys() and type(user1_data[album_id]) == int and type(user2_data[album_id]) == int:
      user1_ratings.append(user1_data[album_id])
      user2_ratings.append(user2_data[album_id])

  return np.corrcoef(np.array(user1_ratings), np.array(user2_ratings))[0, 1]

if __name__ == '__main__':
  main()
