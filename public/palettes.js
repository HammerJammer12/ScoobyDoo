// Hex values are left to right from the supplied palettes; IDs keep saved choices stable.
((root) => {
  const palettes = {
    a: { name: 'Twilight Trail', colors: ['#70708F', '#6F808F', '#8D8F6F', '#8F896F', '#28283A'] },
    b: { name: 'Mint Meadow', colors: ['#5A6E6A', '#5A6E5F', '#6E655A', '#6E5F5A', '#7EC3B5'] },
    c: { name: 'Tropical Punch', colors: ['#78D1CC', '#77D19A', '#D1AF77', '#D19677', '#6F7C7B'] },
    d: { name: 'Watermelon Rush', colors: ['#53B567', '#7FB553', '#B56C53', '#B55362', '#4C6050'] },
    e: { name: 'Cosmic Splash', colors: ['#5772EF', '#56A3F0', '#6B56F0', '#56D3F0', '#9E56F0'] },
    f: { name: 'Jungle Juice', colors: ['#23CB7D', '#23CC43', '#23CCB6', '#41CC23', '#23ABCC'] },
    g: { name: 'Lime Time', colors: ['#83916F', '#585E4E', '#D1F79C', '#C2FF6E', '#ADFF3B'] },
    h: { name: 'Berry Velvet', colors: ['#C8AFBB', '#946C7F', '#613349', '#331121', '#33071C'] },
    i: { name: 'Midnight Arcade', colors: ['#4F5EC6', '#596194', '#4E5061', '#292A33', '#1F2133'] },
    j: { name: 'Cherry Afterburn', colors: ['#B21929', '#7F2B34', '#4C292D', '#332627', '#332C2D'] },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = palettes;
  else root.workoutPalettes = palettes;
})(typeof window === 'undefined' ? null : window);
