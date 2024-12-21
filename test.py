import vertexai
from vertexai.generative_models import GenerativeModel
from vertexai.generative_models import GenerativeModel, Part
import google.generativeai as genai

#pip install google-generativeai

# TODO(developer): Update and un-comment below line
PROJECT_ID = "bajrang-444504"
vertexai.init(project=PROJECT_ID, location="us-central1")

GEMINI_API_KEY = '';
# Initialize the Gemini API client with your API key
genai.configure(api_key=GEMINI_API_KEY)

# Select the model you want to use
model = genai.GenerativeModel('gemini-1.5-flash-002')
# model = GenerativeModel("gemini-1.5-flash-002")

response = model.generate_content(
    "What's a good name for a flower shop that specializes in selling bouquets of dried flowers?"
)

print(response.text)
# Example response:
# **Emphasizing the Dried Aspect:**
# * Everlasting Blooms
# * Dried & Delightful
# * The Petal Preserve
# ...

# vertexai.init(project=PROJECT_ID, location="us-central1")

# model = GenerativeModel("gemini-1.5-flash-002")

# response = model.generate_content(
#     [
#         Part.from_uri(
#             "gs://cloud-samples-data/generative-ai/image/scones.jpg",
#             mime_type="image/jpeg",
#         ),
#         "What is shown in this image?",
#     ]
# )

# print(response.text)
# That's a lovely overhead shot of a rustic-style breakfast or brunch spread.
# Here's what's in the image:
# * **Blueberry scones:** Several freshly baked blueberry scones are arranged on parchment paper.
# They look crumbly and delicious.
# ...