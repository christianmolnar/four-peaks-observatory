# Contact Form Setup Instructions

## FormSpree Setup

Your contact form is ready to use with FormSpree! Follow these steps to complete the setup:

### 1. Create a FormSpree Account
1. Go to [formspree.io](https://formspree.io)
2. Sign up for a free account
3. Create a new form project

### 2. Get Your Form Endpoint
1. In your FormSpree dashboard, copy your form endpoint
2. It will look like: `https://formspree.io/f/YOUR_FORM_ID`

### 3. Update the Contact Page
1. Open `/src/app/contact/page.tsx`
2. Find line 35 with: `action="https://formspree.io/f/YOUR_FORM_ID"`
3. Replace `YOUR_FORM_ID` with your actual FormSpree form ID

### 4. Test the Form
1. Navigate to `/contact` on your site
2. Fill out and submit the test form
3. Check your email for the submission

## Form Features

✅ **Responsive Design** - Works on all device sizes
✅ **Validation** - Required fields with proper error handling
✅ **Thank You Message** - Shows confirmation after submission
✅ **Professional Styling** - Matches your site's dark theme
✅ **Accessibility** - Proper labels and focus states

## FormSpree Free Plan Includes:
- 50 submissions per month
- Email notifications
- Spam filtering
- File uploads (if needed)

## Form Fields:
- **Name** (required)
- **Email** (required) 
- **Subject** (required)
- **Message** (required)

All submissions will be sent to the email address associated with your FormSpree account.

## Additional Configuration (Optional):

### Custom Thank You Page
You can redirect to a custom thank you page by adding:
```html
<input type="hidden" name="_next" value="https://yourdomain.com/thank-you">
```

### Subject Line Customization
Add this hidden field to customize email subjects:
```html
<input type="hidden" name="_subject" value="New Contact Form Submission">
```

### Spam Protection
FormSpree includes built-in spam protection, but you can add a honeypot field:
```html
<input type="text" name="_gotcha" style="display:none">
```

Your contact form is now ready to receive messages!
