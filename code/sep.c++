#include <iostream>
using namespace std;

int main() {
    int j = 0;
   int arr[]={-4,6,-11,-5,3,8,91,-15,-1,50};
    for (int i = 0; i < 10; i++) {
        if (arr[i] < 0) {
            int temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
            j++;
        
        }
    }

    for (int i = 0; i < 10; i++) {
        cout << arr[i] << " ";
    }
    return 0;

}