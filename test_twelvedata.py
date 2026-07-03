import requests

API_KEY = "3ab3fd24a4074c0da5faed3b71b6eb28"  

url = f"https://api.twelvedata.com/quote?symbol=AKBNK:BIST&apikey={API_KEY}"
response = requests.get(url)
print(response.json())