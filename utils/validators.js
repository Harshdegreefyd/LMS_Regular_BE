export const isValidPhoneNumber = (value) => {
  return /^[0-9]{10}$/.test(value);
};

export const isValidEmail = (value) => {
  return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(value);
};